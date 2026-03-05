"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeSentiment = analyzeSentiment;
const logger_1 = __importDefault(require("../../config/logger"));
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const MODEL = 'deepseek-chat';
const TEMPERATURE = 0;
const BATCH_SIZE = 25;
const CACHE_TTL_MS = 15 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 1;
const TOKEN_STOPWORDS = new Set([
    'THE', 'AND', 'FOR', 'WITH', 'THIS', 'THAT', 'FROM', 'WILL', 'JUST', 'YOUR',
    'HAVE', 'HAS', 'WERE', 'WHEN', 'WHAT', 'ABOUT', 'COIN', 'TOKEN', 'CRYPTO',
    'HTTP', 'HTTPS', 'RT', 'USD', 'USDT', 'USDC',
]);
const resultCache = new Map();
function chunk(items, size) {
    const chunks = [];
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }
    return chunks;
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function cleanupCache() {
    const now = Date.now();
    for (const [key, entry] of resultCache.entries()) {
        if (entry.expiresAt <= now) {
            resultCache.delete(key);
        }
    }
}
function cacheKey(tweet) {
    return `${tweet.handle}|${tweet.timestamp}|${tweet.text}`;
}
function stripMarkdownFence(text) {
    return text
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();
}
function parseJsonFromModel(content) {
    const cleaned = stripMarkdownFence(content);
    try {
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed))
            return parsed;
        if (typeof parsed === 'object' && parsed && Array.isArray(parsed.results)) {
            return parsed.results;
        }
    }
    catch {
        // Continue with fallback parse.
    }
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (!arrayMatch)
        return null;
    try {
        const parsed = JSON.parse(arrayMatch[0]);
        return Array.isArray(parsed) ? parsed : null;
    }
    catch {
        return null;
    }
}
function normalizeTokens(input) {
    if (!Array.isArray(input))
        return [];
    const output = new Set();
    for (const item of input) {
        if (typeof item !== 'string')
            continue;
        const normalized = item.replace(/^\$+/, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (normalized.length < 2 || normalized.length > 16)
            continue;
        output.add(normalized);
    }
    return Array.from(output);
}
function extractTokensFromText(text) {
    const cashtags = Array.from(text.matchAll(/\$([A-Za-z][A-Za-z0-9]{1,15})/g))
        .map((m) => m[1].toUpperCase());
    const uppercaseWords = Array.from(text.matchAll(/\b[A-Z]{2,10}\b/g))
        .map((m) => m[0].toUpperCase())
        .filter((token) => !TOKEN_STOPWORDS.has(token));
    const combined = new Set([...cashtags, ...uppercaseWords]);
    return Array.from(combined).slice(0, 8);
}
function normalizeSentiment(input) {
    const sentiment = String(input || '').toLowerCase();
    if (sentiment === 'bullish')
        return 'bullish';
    if (sentiment === 'bearish')
        return 'bearish';
    return 'neutral';
}
function normalizeConfidence(input) {
    const parsed = Number(input);
    if (!Number.isFinite(parsed))
        return 0.5;
    return Math.max(0, Math.min(1, parsed));
}
function fallbackResult(tweet) {
    return {
        handle: tweet.handle,
        text: tweet.text,
        tokens: extractTokensFromText(tweet.text),
        sentiment: 'neutral',
        confidence: 0.4,
        timestamp: tweet.timestamp,
    };
}
function buildPrompt(batch) {
    const rows = batch.map((tweet, index) => ({
        index,
        handle: tweet.handle,
        text: tweet.text,
        timestamp: tweet.timestamp,
    }));
    return [
        'Analyze each tweet and return strict JSON only.',
        'For each row, extract cashtags/tokens mentioned and classify sentiment.',
        'Sentiment must be one of bullish, bearish, neutral.',
        'Confidence must be a number from 0 to 1.',
        'Return an array with this exact schema:',
        '[{"index":0,"tokens":["SOL"],"sentiment":"bullish","confidence":0.86}]',
        'Tweets:',
        JSON.stringify(rows),
    ].join('\n');
}
async function callDeepSeekBatch(batch) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
        throw new Error('DEEPSEEK_API_KEY not set');
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const response = await fetch(DEEPSEEK_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: MODEL,
                temperature: TEMPERATURE,
                messages: [
                    {
                        role: 'system',
                        content: 'You are a strict JSON API. Return JSON only and no extra commentary.',
                    },
                    {
                        role: 'user',
                        content: buildPrompt(batch),
                    },
                ],
            }),
            signal: controller.signal,
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`DeepSeek HTTP ${response.status}: ${errorText}`);
        }
        const data = (await response.json());
        const content = data.choices?.[0]?.message?.content;
        if (!content) {
            throw new Error('DeepSeek returned empty content');
        }
        const parsed = parseJsonFromModel(content);
        if (!parsed) {
            throw new Error('Failed to parse DeepSeek JSON content');
        }
        return parsed;
    }
    finally {
        clearTimeout(timeout);
    }
}
async function analyzeBatch(batch) {
    if (!process.env.DEEPSEEK_API_KEY) {
        logger_1.default.warn('DEEPSEEK_API_KEY missing, using neutral fallback sentiment');
        return batch.map(fallbackResult);
    }
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
        try {
            const rows = await callDeepSeekBatch(batch);
            const rowsByIndex = new Map();
            for (const row of rows) {
                const index = Number(row.index);
                if (Number.isInteger(index)) {
                    rowsByIndex.set(index, row);
                }
            }
            return batch.map((tweet, index) => {
                const row = rowsByIndex.get(index);
                if (!row)
                    return fallbackResult(tweet);
                const tokens = normalizeTokens(row.tokens);
                return {
                    handle: tweet.handle,
                    text: tweet.text,
                    tokens: tokens.length > 0 ? tokens : extractTokensFromText(tweet.text),
                    sentiment: normalizeSentiment(row.sentiment),
                    confidence: normalizeConfidence(row.confidence),
                    timestamp: tweet.timestamp,
                };
            });
        }
        catch (error) {
            logger_1.default.warn({ err: error, attempt: attempt + 1 }, 'DeepSeek sentiment batch failed');
            if (attempt < MAX_RETRIES) {
                await sleep(500);
            }
        }
    }
    return batch.map(fallbackResult);
}
async function analyzeSentiment(tweets) {
    if (tweets.length === 0)
        return [];
    cleanupCache();
    const now = Date.now();
    const output = new Map();
    const missing = [];
    for (const tweet of tweets) {
        const key = cacheKey(tweet);
        const cached = resultCache.get(key);
        if (cached && cached.expiresAt > now) {
            output.set(key, cached.value);
        }
        else {
            missing.push(tweet);
        }
    }
    for (const batch of chunk(missing, BATCH_SIZE)) {
        const analyzed = await analyzeBatch(batch);
        for (const result of analyzed) {
            const key = cacheKey({
                handle: result.handle,
                text: result.text,
                timestamp: result.timestamp,
                likes: 0,
                retweets: 0,
                replies: 0,
            });
            output.set(key, result);
            resultCache.set(key, {
                value: result,
                expiresAt: Date.now() + CACHE_TTL_MS,
            });
        }
    }
    return tweets.map((tweet) => {
        const key = cacheKey(tweet);
        const existing = output.get(key);
        if (existing)
            return existing;
        const fallback = fallbackResult(tweet);
        output.set(key, fallback);
        return fallback;
    });
}
//# sourceMappingURL=sentiment-analyzer.js.map
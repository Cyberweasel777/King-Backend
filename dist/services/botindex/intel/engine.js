"use strict";
/**
 * BotIndex DeepSeek Intelligence Engine
 *
 * Shared engine that takes raw market data from any domain and produces
 * AI-powered analysis: risk scores, signals, fair value estimates, reasoning.
 *
 * Pattern: raw data (free tier) → DeepSeek analysis (paid tier @ $0.05/call)
 * Economics: DeepSeek costs ~$0.002/call, we charge $0.05 = 25x margin.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateIntelReport = generateIntelReport;
const logger_1 = __importDefault(require("../../../config/logger"));
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const MODEL = 'deepseek-chat';
const MAX_TOKENS = 4096;
const TEMPERATURE = 0.2;
const REQUEST_TIMEOUT_MS = 30000;
const MAX_CONCURRENT = 3;
// Simple semaphore for concurrency control
let activeRequests = 0;
const waitQueue = [];
async function acquireSemaphore() {
    if (activeRequests < MAX_CONCURRENT) {
        activeRequests++;
        return;
    }
    return new Promise((resolve) => waitQueue.push(() => { activeRequests++; resolve(); }));
}
function releaseSemaphore() {
    activeRequests--;
    const next = waitQueue.shift();
    if (next)
        next();
}
// ─── DeepSeek Call ──────────────────────────────────────────────────────────
async function callDeepSeek(systemPrompt, userContent) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
        throw new Error('DEEPSEEK_API_KEY not set');
    }
    await acquireSemaphore();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const response = await fetch(DEEPSEEK_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: MODEL,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userContent },
                ],
                temperature: TEMPERATURE,
                max_tokens: MAX_TOKENS,
            }),
            signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`DeepSeek ${response.status}: ${text}`);
        }
        const data = await response.json();
        return data.choices?.[0]?.message?.content || null;
    }
    finally {
        clearTimeout(timeout);
        releaseSemaphore();
    }
}
function parseJsonFromResponse(text) {
    let cleaned = text.trim();
    if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '');
    }
    try {
        return JSON.parse(cleaned.trim());
    }
    catch {
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) {
            try {
                return JSON.parse(match[0]);
            }
            catch {
                return null;
            }
        }
        return null;
    }
}
// ─── Intel Engine ───────────────────────────────────────────────────────────
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min cache for intel (longer than raw data)
const intelCache = new Map();
async function generateIntelReport(config, rawData) {
    const cacheKey = `intel:${config.domain}`;
    const now = Date.now();
    const cached = intelCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
        return cached.data;
    }
    const startMs = Date.now();
    const userContent = config.formatData(rawData);
    try {
        const response = await callDeepSeek(config.systemPrompt, userContent);
        if (!response) {
            throw new Error('Empty DeepSeek response');
        }
        const parsed = parseJsonFromResponse(response);
        if (!parsed || !Array.isArray(parsed.assets)) {
            throw new Error('Invalid DeepSeek response structure');
        }
        // Normalize and clamp all values
        const assets = parsed.assets.map((a) => ({
            id: String(a.id || a.address || ''),
            name: String(a.name || ''),
            symbol: String(a.symbol || ''),
            signal: (['BUY', 'WATCH', 'FADE', 'HOLD'].includes(a.signal) ? a.signal : 'HOLD'),
            confidence: Math.max(0, Math.min(100, Number(a.confidence) || 50)),
            riskScore: Math.max(0, Math.min(100, Number(a.riskScore) || 50)),
            riskLevel: (['low', 'medium', 'high', 'extreme'].includes(a.riskLevel) ? a.riskLevel : 'medium'),
            fairValueEstimate: a.fairValueEstimate != null ? Number(a.fairValueEstimate) : null,
            currentValue: Number(a.currentValue) || 0,
            valuationVerdict: (['undervalued', 'overvalued', 'fair', 'insufficient_data'].includes(a.valuationVerdict)
                ? a.valuationVerdict : 'insufficient_data'),
            grade: (['A', 'B', 'C', 'D', 'F'].includes(a.grade) ? a.grade : 'C'),
            reasoning: String(a.reasoning || ''),
            keyMetrics: a.keyMetrics || {},
        }));
        const processingMs = Date.now() - startMs;
        const report = {
            domain: config.domain,
            assets,
            marketSummary: String(parsed.marketSummary || ''),
            topPick: parsed.topPick || null,
            source: 'deepseek',
            model: MODEL,
            analyzedAt: new Date().toISOString(),
            processingMs,
        };
        logger_1.default.info({ domain: config.domain, assets: assets.length, processingMs, topPick: report.topPick }, 'DeepSeek intel report generated');
        intelCache.set(cacheKey, { data: report, expiresAt: now + CACHE_TTL_MS });
        return report;
    }
    catch (error) {
        logger_1.default.error({ err: error, domain: config.domain }, 'DeepSeek intel generation failed');
        if (cached) {
            return cached.data;
        }
        return {
            domain: config.domain,
            assets: [],
            marketSummary: 'Analysis temporarily unavailable.',
            topPick: null,
            source: 'error',
            model: MODEL,
            analyzedAt: new Date().toISOString(),
            processingMs: Date.now() - startMs,
        };
    }
}
//# sourceMappingURL=engine.js.map
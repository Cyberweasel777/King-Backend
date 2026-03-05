"use strict";
/** BotIndex DeepSeek Stats - DeepSeek Client */
Object.defineProperty(exports, "__esModule", { value: true });
exports.callDeepSeek = callDeepSeek;
exports.checkApiHealth = checkApiHealth;
exports.stripMarkdownFences = stripMarkdownFences;
exports.parseJsonResponse = parseJsonResponse;
const prompts_1 = require("./prompts");
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const DEFAULT_MODEL = 'deepseek-chat';
const DEEP_MODEL = 'deepseek-reasoner';
const MAX_TOKENS = 8192;
const TEMPERATURE = 0.3;
const MAX_CONCURRENT_REQUESTS = 3;
const REQUEST_TIMEOUT_MS = 90000;
class Semaphore {
    permits;
    queue = [];
    constructor(permits) {
        this.permits = permits;
    }
    async acquire() {
        if (this.permits > 0) {
            this.permits--;
            return;
        }
        return new Promise((resolve) => this.queue.push(resolve));
    }
    release() {
        this.permits++;
        const next = this.queue.shift();
        if (next) {
            this.permits--;
            next();
        }
    }
}
const requestSemaphore = new Semaphore(MAX_CONCURRENT_REQUESTS);
function stripMarkdownFences(text) {
    return text
        .replace(/^```json\s*/i, '')
        .replace(/```\s*$/i, '')
        .replace(/^```\s*/i, '')
        .trim();
}
function parseJsonResponse(text) {
    const cleaned = stripMarkdownFences(text);
    try {
        return JSON.parse(cleaned);
    }
    catch {
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[0]);
            }
            catch {
                return null;
            }
        }
        return null;
    }
}
function getApiKey() {
    const key = process.env.DEEPSEEK_API_KEY;
    if (!key) {
        throw new Error('DEEPSEEK_API_KEY environment variable not set');
    }
    return key;
}
async function callDeepSeek(promptType, userContent, options = {}) {
    const model = options.deepAnalysis ? DEEP_MODEL : DEFAULT_MODEL;
    const timeoutMs = options.timeoutMs || REQUEST_TIMEOUT_MS;
    await requestSemaphore.acquire();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(DEEPSEEK_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getApiKey()}`,
            },
            body: JSON.stringify({
                model,
                messages: [
                    { role: 'system', content: prompts_1.SYSTEM_PROMPTS[promptType] },
                    { role: 'user', content: userContent },
                ],
                temperature: TEMPERATURE,
                max_tokens: MAX_TOKENS,
            }),
            signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
            const errorText = await response.text();
            return {
                result: null,
                error: `DeepSeek API error: ${response.status} - ${errorText}`,
                modelUsed: model,
            };
        }
        const data = (await response.json());
        const content = data.choices?.[0]?.message?.content;
        if (!content) {
            return {
                result: null,
                error: 'Empty response from DeepSeek API',
                modelUsed: model,
            };
        }
        const result = parseJsonResponse(content);
        if (!result) {
            return {
                result: null,
                error: 'Failed to parse JSON response',
                modelUsed: model,
            };
        }
        return { result, error: null, modelUsed: model };
    }
    catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === 'AbortError') {
            return {
                result: null,
                error: 'Request timeout exceeded',
                modelUsed: model,
            };
        }
        return {
            result: null,
            error: error instanceof Error ? error.message : 'Unknown error',
            modelUsed: model,
        };
    }
    finally {
        requestSemaphore.release();
    }
}
async function checkApiHealth() {
    // Simple env var check - avoids wasting API credits
    return Boolean(process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_API_KEY.length > 0);
}
//# sourceMappingURL=deepseek-client.js.map
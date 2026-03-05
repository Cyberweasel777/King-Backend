"use strict";
/**
 * SkinSignal DeepSeek Client — King Backend
 * Thin OpenAI-compatible wrapper with concurrency limit (3) and graceful fallback
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.callDeepSeek = callDeepSeek;
exports.parseDeepSeekJson = parseDeepSeekJson;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const REQUEST_TIMEOUT_MS = 45_000;
const MAX_CONCURRENT = 3;
class Semaphore {
    count;
    queue = [];
    constructor(n) { this.count = n; }
    acquire() {
        if (this.count > 0) {
            this.count--;
            return Promise.resolve();
        }
        return new Promise(r => this.queue.push(r));
    }
    release() {
        if (this.queue.length) {
            this.queue.shift()();
        }
        else {
            this.count++;
        }
    }
}
const sem = new Semaphore(MAX_CONCURRENT);
function getApiKey() {
    const k = process.env.DEEPSEEK_API_KEY;
    if (!k)
        throw new Error('DEEPSEEK_API_KEY not set');
    return k;
}
function stripFences(s) {
    return s.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
}
async function callDeepSeek(system, user, opts = {}) {
    const model = opts.model ?? process.env.DEEPSEEK_MODEL_STATS ?? 'deepseek-chat';
    const temperature = opts.temperature ?? 0.3;
    const max_tokens = opts.maxTokens ?? 8192;
    const requireJson = opts.requireJson ?? true;
    await sem.acquire();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    try {
        const body = {
            model,
            messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
            temperature,
            max_tokens,
        };
        if (requireJson)
            body.response_format = { type: 'json_object' };
        const resp = await fetch(DEEPSEEK_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getApiKey()}` },
            body: JSON.stringify(body),
            signal: ctrl.signal,
        });
        if (!resp.ok)
            throw new Error(`DeepSeek ${resp.status}: ${await resp.text()}`);
        const data = (await resp.json());
        return stripFences(data.choices[0]?.message?.content ?? '');
    }
    finally {
        clearTimeout(timer);
        sem.release();
    }
}
async function parseDeepSeekJson(system, user, fallback, opts = {}) {
    try {
        const raw = await callDeepSeek(system, user, opts);
        const parsed = JSON.parse(raw);
        return { data: parsed, fromApi: true };
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[skinsignal/deepseek] fallback: ${msg}`);
        try {
            return { data: fallback(), fromApi: false, error: msg };
        }
        catch {
            return { data: null, fromApi: false, error: msg };
        }
    }
}
//# sourceMappingURL=deepseek-client.js.map
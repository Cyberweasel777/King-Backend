"use strict";
/**
 * SkinSignal Stats Cache — King Backend
 * Simple in-memory TTL cache
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.statsCache = void 0;
exports.createCacheKey = createCacheKey;
const DEFAULT_TTL_MS = 15 * 60 * 1_000; // 15 min
class StatsCache {
    store = new Map();
    set(key, value, ttlMs = DEFAULT_TTL_MS) {
        this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
    }
    get(key) {
        const entry = this.store.get(key);
        if (!entry)
            return undefined;
        if (Date.now() > entry.expiresAt) {
            this.store.delete(key);
            return undefined;
        }
        return entry.value;
    }
    delete(key) { this.store.delete(key); }
    clear() { this.store.clear(); }
    size() { return this.store.size; }
}
exports.statsCache = new StatsCache();
function createCacheKey(prefix, params) {
    const sorted = Object.keys(params).sort().map(k => `${k}:${JSON.stringify(params[k])}`).join('|');
    return `${prefix}:${sorted}`;
}
//# sourceMappingURL=cache.js.map
"use strict";
/**
 * In-Memory Cache with TTL
 * Shared across agents
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.riskCache = exports.sentimentCache = exports.tokenCache = exports.priceCache = void 0;
class Cache {
    store = new Map();
    defaultTtl;
    constructor(defaultTtlMs = 60000) {
        this.defaultTtl = defaultTtlMs;
        // Cleanup expired entries every 5 minutes
        setInterval(() => this.cleanup(), 300000);
    }
    generateKey(...parts) {
        return parts.join(':');
    }
    set(key, data, ttlMs) {
        this.store.set(key, {
            data,
            timestamp: Date.now(),
            ttl: ttlMs || this.defaultTtl,
        });
    }
    get(key) {
        const entry = this.store.get(key);
        if (!entry)
            return null;
        if (Date.now() - entry.timestamp > entry.ttl) {
            this.store.delete(key);
            return null;
        }
        return entry.data;
    }
    has(key) {
        return this.get(key) !== null;
    }
    delete(key) {
        return this.store.delete(key);
    }
    clear() {
        this.store.clear();
    }
    cleanup() {
        const now = Date.now();
        for (const [key, entry] of this.store.entries()) {
            if (now - entry.timestamp > entry.ttl) {
                this.store.delete(key);
            }
        }
    }
    size() {
        return this.store.size;
    }
}
// Global cache instances with different TTLs
exports.priceCache = new Cache(30000); // 30 seconds for prices
exports.tokenCache = new Cache(300000); // 5 minutes for token data
exports.sentimentCache = new Cache(600000); // 10 minutes for sentiment
exports.riskCache = new Cache(3600000); // 1 hour for risk scores
exports.default = Cache;
//# sourceMappingURL=cache.js.map
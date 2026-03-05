"use strict";
/** BotIndex DeepSeek Stats - Cache */
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatsCache = exports.statsCache = void 0;
const DEFAULT_TTL_MS = 15 * 60 * 1000;
const MAX_ENTRIES = 1000;
class StatsCache {
    cache = new Map();
    stats = { hits: 0, misses: 0, evictions: 0 };
    ttlMs;
    constructor(ttlMs = DEFAULT_TTL_MS) {
        this.ttlMs = ttlMs;
        setInterval(() => this.cleanup(), 5 * 60 * 1000);
    }
    generateKey(type, data) {
        const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
        let hash = 0;
        const str = `${type}:${dataStr}`;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return `${type}:${Math.abs(hash).toString(36)}`;
    }
    get(type, data) {
        const key = this.generateKey(type, data);
        const entry = this.cache.get(key);
        if (!entry) {
            this.stats.misses++;
            return null;
        }
        if (Date.now() - entry.timestamp > this.ttlMs) {
            this.cache.delete(key);
            this.stats.misses++;
            this.stats.evictions++;
            return null;
        }
        this.stats.hits++;
        return entry.data;
    }
    set(type, data, result) {
        if (this.cache.size >= MAX_ENTRIES) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey !== undefined) {
                this.cache.delete(firstKey);
                this.stats.evictions++;
            }
        }
        const key = this.generateKey(type, data);
        this.cache.set(key, {
            data: result,
            timestamp: Date.now(),
            key,
        });
    }
    invalidate(type) {
        if (type) {
            for (const [key] of this.cache) {
                if (key.startsWith(`${type}:`)) {
                    this.cache.delete(key);
                }
            }
        }
        else {
            this.cache.clear();
        }
    }
    cleanup() {
        const now = Date.now();
        for (const [key, entry] of this.cache) {
            if (now - entry.timestamp > this.ttlMs) {
                this.cache.delete(key);
                this.stats.evictions++;
            }
        }
    }
    getStats() {
        const total = this.stats.hits + this.stats.misses;
        return {
            ...this.stats,
            size: this.cache.size,
            hitRate: total > 0 ? this.stats.hits / total : 0,
        };
    }
}
exports.StatsCache = StatsCache;
exports.statsCache = new StatsCache();
//# sourceMappingURL=cache.js.map
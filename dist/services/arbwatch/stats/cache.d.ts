/** ArbWatch DeepSeek Stats - Cache */
interface CacheStats {
    hits: number;
    misses: number;
    evictions: number;
}
declare class StatsCache {
    private cache;
    private stats;
    private ttlMs;
    constructor(ttlMs?: number);
    private generateKey;
    get<T>(type: string, data: unknown): T | null;
    set<T>(type: string, data: unknown, result: T): void;
    invalidate(type?: string): void;
    private cleanup;
    getStats(): CacheStats & {
        size: number;
        hitRate: number;
    };
}
export declare const statsCache: StatsCache;
export { StatsCache };
//# sourceMappingURL=cache.d.ts.map
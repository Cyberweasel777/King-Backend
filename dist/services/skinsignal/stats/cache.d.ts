/**
 * SkinSignal Stats Cache — King Backend
 * Simple in-memory TTL cache
 */
declare class StatsCache {
    private store;
    set<T>(key: string, value: T, ttlMs?: number): void;
    get<T>(key: string): T | undefined;
    delete(key: string): void;
    clear(): void;
    size(): number;
}
export declare const statsCache: StatsCache;
export declare function createCacheKey(prefix: string, params: Record<string, unknown>): string;
export {};
//# sourceMappingURL=cache.d.ts.map
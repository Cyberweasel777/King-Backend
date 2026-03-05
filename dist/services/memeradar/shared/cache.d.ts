/**
 * In-Memory Cache with TTL
 * Shared across agents
 */
declare class Cache {
    private store;
    private defaultTtl;
    constructor(defaultTtlMs?: number);
    generateKey(...parts: string[]): string;
    set<T>(key: string, data: T, ttlMs?: number): void;
    get<T>(key: string): T | null;
    has(key: string): boolean;
    delete(key: string): boolean;
    clear(): void;
    private cleanup;
    size(): number;
}
export declare const priceCache: Cache;
export declare const tokenCache: Cache;
export declare const sentimentCache: Cache;
export declare const riskCache: Cache;
export default Cache;
//# sourceMappingURL=cache.d.ts.map
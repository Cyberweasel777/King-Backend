/**
 * SkinSignal Service Facade — King Backend
 * CS2 skin arbitrage detection: stateless scraping + in-memory caching.
 * Mirrors the arbwatch service pattern.
 */
import type { SkinOpportunity, Marketplace } from './types';
export interface GetOpportunitiesOptions {
    minNetSpreadPct?: number;
    useDeepSeek?: boolean;
    limit?: number;
    debug?: boolean;
    ttlMs?: number;
    /** Override the default hot-skin list */
    skinNames?: string[];
}
export interface OpportunitiesMeta {
    markets: Marketplace[];
    scrapedSkins: number;
    scrapedAt: string;
    minNetSpreadPct: number;
    useDeepSeek: boolean;
    limit: number;
    cache?: {
        hit: boolean;
        ageMs: number;
        ttlMs: number;
    };
    errors?: string[];
}
export declare function getOpportunities(opts?: GetOpportunitiesOptions): Promise<{
    opportunities: SkinOpportunity[];
    meta: OpportunitiesMeta;
}>;
/**
 * On-demand scan of a single skin (bypasses the hot-skin cache).
 */
export declare function scanSkin(skinName: string, opts?: {
    useDeepSeek?: boolean;
    minNetSpreadPct?: number;
}): Promise<{
    skinName: string;
    opportunities: SkinOpportunity[];
    errors: string[];
    scrapedAt: string;
}>;
export declare function getMarkets(): Marketplace[];
export declare function getHotSkins(): import("./hot-skins").HotSkin[];
/** Bust the cache (useful after config changes or forced refresh) */
export declare function bustCache(): void;
//# sourceMappingURL=index.d.ts.map
/**
 * ArbWatch service facade for King Backend.
 * Provides scraping + arbitrage detection without requiring DB writes.
 */
import type { ArbitrageOpportunity, PredictionMarket } from './types';
type ScraperDebugMeta = Record<PredictionMarket, {
    ok: boolean;
    count: unknown;
    durationMs: number;
    errors: string[];
}>;
type OpportunitiesMeta = {
    markets: PredictionMarket[];
    scrapedAt?: string;
    useDeepseek: boolean;
    minProfitPercent: number;
    limit: number;
    matches: number;
    matchedOutcomes: number;
    scrapers?: ScraperDebugMeta;
    cache?: {
        hit: boolean;
        ageMs: number;
        ttlMs: number;
    };
    errors?: string[];
};
export declare function getOpportunities(params?: {
    minProfitPercent?: number;
    useDeepseek?: boolean;
    limit?: number;
    debug?: boolean;
    ttlMs?: number;
}): Promise<{
    opportunities: ArbitrageOpportunity[];
    meta: OpportunitiesMeta;
}>;
export declare function getMarkets(): PredictionMarket[];
export {};
//# sourceMappingURL=index.d.ts.map
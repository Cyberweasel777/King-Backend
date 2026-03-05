/**
 * Scraper Index
 * Coordinates all prediction market scrapers
 */
import { ScrapeResult, PredictionMarket } from '../types';
export * from './base-scraper';
export * from './polymarket-scraper';
export * from './kalshi-scraper';
/**
 * Per-scraper run metadata (used for debug/observability)
 */
export interface ScraperRunMeta {
    ok: boolean;
    count: {
        events: number;
        markets: number;
        oddsSnapshots: number;
    };
    durationMs: number;
    errors: string[];
}
/**
 * Run all scrapers and return combined results.
 *
 * NOTE: This function is intentionally best-effort: one scraper failing should
 * never prevent others from returning results.
 */
export declare function scrapeAll(): Promise<Record<PredictionMarket, ScrapeResult>>;
/**
 * Run all scrapers and also return per-scraper metadata for debugging.
 */
export declare function scrapeAllWithMeta(): Promise<{
    results: Record<PredictionMarket, ScrapeResult>;
    meta: Record<PredictionMarket, ScraperRunMeta>;
}>;
/**
 * Scrape a specific market
 */
export declare function scrapeMarket(market: PredictionMarket): Promise<ScrapeResult>;
/**
 * Get available scrapers
 */
export declare function getAvailableScrapers(): PredictionMarket[];
//# sourceMappingURL=index.d.ts.map
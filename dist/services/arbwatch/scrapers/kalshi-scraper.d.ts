/**
 * Kalshi Scraper
 * Uses Kalshi API v2
 * Docs: https://trading-api.readme.io/reference/
 */
import { BaseScraper } from './base-scraper';
import { ScrapeResult, PredictionMarket } from '../types';
export declare class KalshiScraper extends BaseScraper {
    private apiUrl;
    constructor();
    getMarketplace(): PredictionMarket;
    scrape(): Promise<ScrapeResult>;
    private fetchActiveEvents;
    private fetchOpenMarkets;
    private parseEvent;
    private parseMarket;
    private createOddsSnapshot;
}
//# sourceMappingURL=kalshi-scraper.d.ts.map
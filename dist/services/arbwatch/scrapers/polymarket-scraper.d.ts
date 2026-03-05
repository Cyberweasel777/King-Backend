/**
 * Polymarket Scraper
 * Uses Polymarket CLOB API and Gamma API
 * Docs: https://docs.polymarket.com/
 */
import { BaseScraper } from './base-scraper';
import { ScrapeResult, PredictionMarket } from '../types';
export declare class PolymarketScraper extends BaseScraper {
    private gammaApiUrl;
    private clobApiUrl;
    constructor();
    getMarketplace(): PredictionMarket;
    scrape(): Promise<ScrapeResult>;
    private fetchActiveEvents;
    private fetchMarketOrderbook;
    private parseEvent;
    private parseMarket;
    private createOddsSnapshot;
}
//# sourceMappingURL=polymarket-scraper.d.ts.map
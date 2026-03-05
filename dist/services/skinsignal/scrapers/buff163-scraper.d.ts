/**
 * Buff163 Scraper — King Backend SkinSignal
 * Unofficial API; requires BUFF163_SESSION cookie for authenticated requests
 */
import { BaseScraper } from './base-scraper';
import { Marketplace, ScrapeResult } from '../types';
export declare class Buff163Scraper extends BaseScraper {
    constructor();
    getMarketplace(): Marketplace;
    /** Convert CNY → USD using env-configured rate (default 0.14) */
    private cnyToUsd;
    private findGoodsId;
    private getLowestPrice;
    scrape(skinName: string): Promise<ScrapeResult>;
}
export declare const buff163Scraper: Buff163Scraper;
//# sourceMappingURL=buff163-scraper.d.ts.map
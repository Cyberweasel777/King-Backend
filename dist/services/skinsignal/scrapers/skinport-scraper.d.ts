/**
 * Skinport Scraper — King Backend SkinSignal
 * Uses the official Skinport public API (no auth required for /v1/items)
 * https://docs.skinport.com/
 */
import { BaseScraper } from './base-scraper';
import { Marketplace, ScrapeResult } from '../types';
export declare class SkinportScraper extends BaseScraper {
    constructor();
    getMarketplace(): Marketplace;
    private getAuthHeaders;
    scrape(skinName: string): Promise<ScrapeResult>;
}
export declare const skinportScraper: SkinportScraper;
//# sourceMappingURL=skinport-scraper.d.ts.map
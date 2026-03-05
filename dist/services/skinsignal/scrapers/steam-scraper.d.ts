/**
 * Steam Market Scraper — King Backend SkinSignal
 * Uses Steam Community Market public price-overview endpoint (no auth required)
 */
import { BaseScraper } from './base-scraper';
import { Marketplace, ScrapeResult } from '../types';
export declare class SteamMarketScraper extends BaseScraper {
    private readonly appId;
    private readonly currency;
    constructor();
    getMarketplace(): Marketplace;
    scrape(skinName: string): Promise<ScrapeResult>;
}
export declare const steamScraper: SteamMarketScraper;
//# sourceMappingURL=steam-scraper.d.ts.map
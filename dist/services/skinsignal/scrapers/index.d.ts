/**
 * SkinSignal Scrapers Index — King Backend
 */
import { Marketplace, ScrapeResult } from '../types';
export { BaseScraper } from './base-scraper';
export { steamScraper } from './steam-scraper';
export { buff163Scraper } from './buff163-scraper';
export { skinportScraper } from './skinport-scraper';
export declare function getAvailableScrapers(): Marketplace[];
/**
 * Run all scrapers in parallel for a given skin name.
 * Best-effort: errors per scraper are captured, not thrown.
 */
export declare function scrapeAll(skinName: string): Promise<ScrapeResult[]>;
/**
 * Scrape a single marketplace.
 */
export declare function scrapeOne(market: Marketplace, skinName: string): Promise<ScrapeResult>;
//# sourceMappingURL=index.d.ts.map
/**
 * SkinSignal Scrapers Index — King Backend
 */

import { BaseScraper } from './base-scraper';
import { steamScraper } from './steam-scraper';
import { buff163Scraper } from './buff163-scraper';
import { skinportScraper } from './skinport-scraper';
import { Marketplace, ScrapeResult } from '../types';

export { BaseScraper } from './base-scraper';
export { steamScraper } from './steam-scraper';
export { buff163Scraper } from './buff163-scraper';
export { skinportScraper } from './skinport-scraper';

const allScrapers: BaseScraper[] = [steamScraper, buff163Scraper, skinportScraper];

export function getAvailableScrapers(): Marketplace[] {
  return allScrapers.map(s => s.getMarketplace());
}

/**
 * Run all scrapers in parallel for a given skin name.
 * Best-effort: errors per scraper are captured, not thrown.
 */
export async function scrapeAll(skinName: string): Promise<ScrapeResult[]> {
  const results = await Promise.allSettled(
    allScrapers.map(s => s.scrape(skinName)),
  );

  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    return {
      market: allScrapers[i].getMarketplace(),
      skinName,
      prices: [],
      errors: [r.reason instanceof Error ? r.reason.message : String(r.reason)],
      scrapedAt: new Date().toISOString(),
    };
  });
}

/**
 * Scrape a single marketplace.
 */
export async function scrapeOne(market: Marketplace, skinName: string): Promise<ScrapeResult> {
  const scraper = allScrapers.find(s => s.getMarketplace() === market);
  if (!scraper) throw new Error(`Unknown marketplace: ${market}`);
  return scraper.scrape(skinName);
}

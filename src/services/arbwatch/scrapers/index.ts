/**
 * Scraper Index
 * Coordinates all prediction market scrapers
 */

import { PolymarketScraper } from './polymarket-scraper';
import { KalshiScraper } from './kalshi-scraper';
import { ScrapeResult, PredictionMarket } from '../types';

export * from './base-scraper';
export * from './polymarket-scraper';
export * from './kalshi-scraper';

const activeScrapers: { name: PredictionMarket; scraper: any }[] = [
  { name: 'polymarket', scraper: new PolymarketScraper() },
  { name: 'kalshi', scraper: new KalshiScraper() },
];

/**
 * Run all scrapers and return combined results
 */
export async function scrapeAll(): Promise<Record<PredictionMarket, ScrapeResult>> {
  const results: any = {};

  console.log('\n🔍 Starting market scrape...\n');

  for (const { name, scraper } of activeScrapers) {
    try {
      const result = await scraper.scrape();
      results[scraper.getMarketplace()] = result;
    } catch (error) {
      console.error(`Scraper ${name} failed:`, error);
      results[name] = {
        market: name,
        events: [],
        markets: [],
        oddsSnapshots: [],
        errors: [(error as Error).message],
        scrapedAt: new Date().toISOString(),
      };
    }
  }

  console.log('\n✅ Scraping complete\n');
  return results as Record<PredictionMarket, ScrapeResult>;
}

/**
 * Scrape a specific market
 */
export async function scrapeMarket(market: PredictionMarket): Promise<ScrapeResult> {
  const entry = activeScrapers.find(s => s.name === market);
  if (!entry || !entry.scraper) {
    throw new Error(`No scraper found for market: ${market}`);
  }
  return entry.scraper.scrape();
}

/**
 * Get available scrapers
 */
export function getAvailableScrapers(): PredictionMarket[] {
  return activeScrapers.map(s => s.name);
}

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
export async function scrapeAll(): Promise<Record<PredictionMarket, ScrapeResult>> {
  const { results } = await scrapeAllWithMeta();
  return results;
}

/**
 * Run all scrapers and also return per-scraper metadata for debugging.
 */
export async function scrapeAllWithMeta(): Promise<{
  results: Record<PredictionMarket, ScrapeResult>;
  meta: Record<PredictionMarket, ScraperRunMeta>;
}> {
  const results: any = {};
  const meta: any = {};

  console.log('\n🔍 Starting market scrape...\n');

  for (const { name, scraper } of activeScrapers) {
    const startedAt = Date.now();
    try {
      const result: ScrapeResult = await scraper.scrape();
      const market = scraper.getMarketplace() as PredictionMarket;
      results[market] = result;
      meta[market] = {
        ok: true,
        count: {
          events: result.events?.length ?? 0,
          markets: result.markets?.length ?? 0,
          oddsSnapshots: result.oddsSnapshots?.length ?? 0,
        },
        durationMs: Date.now() - startedAt,
        errors: result.errors ?? [],
      } satisfies ScraperRunMeta;
    } catch (error) {
      const msg = (error as Error)?.message || String(error);
      console.error(`Scraper ${name} failed:`, error);
      results[name] = {
        market: name,
        events: [],
        markets: [],
        oddsSnapshots: [],
        errors: [msg],
        scrapedAt: new Date().toISOString(),
      } satisfies ScrapeResult;
      meta[name] = {
        ok: false,
        count: { events: 0, markets: 0, oddsSnapshots: 0 },
        durationMs: Date.now() - startedAt,
        errors: [msg],
      } satisfies ScraperRunMeta;
    }
  }

  console.log('\n✅ Scraping complete\n');
  return { results: results as Record<PredictionMarket, ScrapeResult>, meta };
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

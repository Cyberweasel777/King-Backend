/**
 * ArbWatch service facade for King Backend.
 * Provides scraping + arbitrage detection without requiring DB writes.
 */

import { scrapeAll, getAvailableScrapers } from './scrapers';
import { matchMarketsAcrossPlatforms, detectArbitrageWithStats, detectArbitrage } from './integrations/arbitrage-engine';
import type { ScrapeResult, ArbitrageOpportunity, PredictionMarket } from './types';

export async function getOpportunities(params?: {
  minProfitPercent?: number;
  useDeepseek?: boolean;
  limit?: number;
}): Promise<{ opportunities: ArbitrageOpportunity[]; meta: any }> {
  const minProfitPercent = params?.minProfitPercent ?? 0.5;
  const useDeepseek = params?.useDeepseek ?? true;
  const limit = params?.limit ?? 20;

  const results = await scrapeAll();

  const events: Record<string, any[]> = {};
  const markets: Record<string, any[]> = {};
  for (const [m, r] of Object.entries(results)) {
    events[m] = (r as ScrapeResult).events;
    markets[m] = (r as ScrapeResult).markets;
  }

  const matches = matchMarketsAcrossPlatforms(events as any, markets as any);
  const opportunities = useDeepseek
    ? await detectArbitrageWithStats(matches, minProfitPercent)
    : detectArbitrage(matches, minProfitPercent);

  return {
    opportunities: opportunities.slice(0, limit),
    meta: {
      markets: Object.keys(results),
      matches: matches.length,
      scrapedAt: Object.values(results)[0]?.scrapedAt,
      useDeepseek,
      minProfitPercent,
      limit,
    },
  };
}

export function getMarkets(): PredictionMarket[] {
  return getAvailableScrapers();
}

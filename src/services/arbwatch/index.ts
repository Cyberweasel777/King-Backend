/**
 * ArbWatch service facade for King Backend.
 * Provides scraping + arbitrage detection without requiring DB writes.
 */

import { scrapeAllWithMeta, getAvailableScrapers } from './scrapers';
import { matchMarketsAcrossPlatforms, detectArbitrageWithStats, detectArbitrage } from './integrations/arbitrage-engine';
import type { ScrapeResult, ArbitrageOpportunity, PredictionMarket } from './types';

type ScraperDebugMeta = Record<PredictionMarket, { ok: boolean; count: unknown; durationMs: number; errors: string[] }>;

type OpportunitiesMeta = {
  markets: PredictionMarket[];
  scrapedAt?: string;
  useDeepseek: boolean;
  minProfitPercent: number;
  limit: number;
  // match stats
  matches: number;
  matchedOutcomes: number;
  // debug (only returned when requested)
  scrapers?: ScraperDebugMeta;
  cache?: { hit: boolean; ageMs: number; ttlMs: number };
  errors?: string[];
};

type CachedMeta = Omit<OpportunitiesMeta, 'limit' | 'cache'>;

const DEFAULT_CACHE_TTL_MS = 60_000;

let cache:
  | {
      key: string;
      createdAt: number;
      ttlMs: number;
      opportunities: ArbitrageOpportunity[];
      baseMeta: CachedMeta;
    }
  | undefined;

let inFlight: Promise<{
  opportunities: ArbitrageOpportunity[];
  baseMeta: CachedMeta;
}> | null = null;

function cacheKey(params: { minProfitPercent: number; useDeepseek: boolean }): string {
  return JSON.stringify({ minProfitPercent: params.minProfitPercent, useDeepseek: params.useDeepseek });
}

async function computeOpportunities(params: {
  minProfitPercent: number;
  useDeepseek: boolean;
}): Promise<{ opportunities: ArbitrageOpportunity[]; baseMeta: CachedMeta }> {
  try {
    const { results, meta: scraperMeta } = await scrapeAllWithMeta();

    const events: Record<string, any[]> = {};
    const markets: Record<string, any[]> = {};
    for (const [m, r] of Object.entries(results)) {
      events[m] = (r as ScrapeResult).events;
      markets[m] = (r as ScrapeResult).markets;
    }

    const matches = matchMarketsAcrossPlatforms(events as any, markets as any);
    const opportunities = params.useDeepseek
      ? await detectArbitrageWithStats(matches, params.minProfitPercent)
      : detectArbitrage(matches, params.minProfitPercent);

    const matchedOutcomes = matches.reduce((sum, m) => sum + (m.matchedOutcomes?.length ?? 0), 0);

    const firstScrapedAt = Object.values(results)[0]?.scrapedAt;

    const baseMeta: CachedMeta = {
      markets: Object.keys(results) as PredictionMarket[],
      matches: matches.length,
      matchedOutcomes,
      scrapedAt: firstScrapedAt,
      useDeepseek: params.useDeepseek,
      minProfitPercent: params.minProfitPercent,
      scrapers: scraperMeta as unknown as ScraperDebugMeta,
      errors: [],
    };

    return { opportunities, baseMeta };
  } catch (error) {
    const msg = (error as Error)?.message || String(error);
    return {
      opportunities: [],
      baseMeta: {
        markets: getAvailableScrapers(),
        matches: 0,
        matchedOutcomes: 0,
        scrapedAt: new Date().toISOString(),
        useDeepseek: params.useDeepseek,
        minProfitPercent: params.minProfitPercent,
        errors: [msg],
      },
    };
  }
}

async function getCachedOrCompute(params: {
  minProfitPercent: number;
  useDeepseek: boolean;
  ttlMs: number;
}): Promise<{ opportunities: ArbitrageOpportunity[]; baseMeta: CachedMeta; cacheHit: boolean; ageMs: number }> {
  const key = cacheKey(params);
  const now = Date.now();

  if (cache && cache.key === key) {
    const ageMs = now - cache.createdAt;
    if (ageMs < cache.ttlMs) {
      return { opportunities: cache.opportunities, baseMeta: cache.baseMeta, cacheHit: true, ageMs };
    }
  }

  if (!inFlight) {
    inFlight = computeOpportunities({ minProfitPercent: params.minProfitPercent, useDeepseek: params.useDeepseek }).finally(() => {
      inFlight = null;
    });
  }

  const computed = await inFlight;
  cache = {
    key,
    createdAt: now,
    ttlMs: params.ttlMs,
    opportunities: computed.opportunities,
    baseMeta: computed.baseMeta,
  };

  return { opportunities: computed.opportunities, baseMeta: computed.baseMeta, cacheHit: false, ageMs: 0 };
}

export async function getOpportunities(params?: {
  minProfitPercent?: number;
  useDeepseek?: boolean;
  limit?: number;
  debug?: boolean;
  ttlMs?: number;
}): Promise<{ opportunities: ArbitrageOpportunity[]; meta: OpportunitiesMeta }> {
  const minProfitPercent = params?.minProfitPercent ?? 0.5;
  const useDeepseek = params?.useDeepseek ?? true;
  const limit = params?.limit ?? 20;
  const debug = params?.debug ?? false;
  const ttlMs = params?.ttlMs ?? DEFAULT_CACHE_TTL_MS;

  const cached = await getCachedOrCompute({ minProfitPercent, useDeepseek, ttlMs });

  const baseMeta = cached.baseMeta;

  const meta: OpportunitiesMeta = {
    markets: baseMeta.markets,
    matches: baseMeta.matches,
    matchedOutcomes: baseMeta.matchedOutcomes,
    scrapedAt: baseMeta.scrapedAt,
    useDeepseek,
    minProfitPercent,
    limit,
  };

  if (debug) {
    meta.scrapers = baseMeta.scrapers;
    meta.errors = baseMeta.errors;
    meta.cache = { hit: cached.cacheHit, ageMs: cached.ageMs, ttlMs };
  }

  return {
    opportunities: cached.opportunities.slice(0, limit),
    meta,
  };
}

export function getMarkets(): PredictionMarket[] {
  return getAvailableScrapers();
}

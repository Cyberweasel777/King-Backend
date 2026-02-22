/**
 * SkinSignal Service Facade — King Backend
 * CS2 skin arbitrage detection: stateless scraping + in-memory caching.
 * Mirrors the arbwatch service pattern.
 */

import { scrapeAll, getAvailableScrapers } from './scrapers';
import { detectOpportunities } from './arbitrage';
import { getHotSkinNames, HOT_SKINS } from './hot-skins';
import type { SkinOpportunity, Marketplace } from './types';

// ── Cache ────────────────────────────────────────────────────────────────────

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1_000; // 5 min (skin prices can move fast)

interface CacheEntry {
  opportunities: SkinOpportunity[];
  scrapedSkins: number;
  scrapedAt: string;
  errors: string[];
}

let cache: { key: string; createdAt: number; ttlMs: number; data: CacheEntry } | undefined;
let inFlight: Promise<CacheEntry> | null = null;

function cacheKey(params: { minNetSpreadPct: number; useDeepSeek: boolean }): string {
  return JSON.stringify(params);
}

// ── Core compute ─────────────────────────────────────────────────────────────

async function computeOpportunities(params: {
  minNetSpreadPct: number;
  useDeepSeek: boolean;
  skinNames: string[];
}): Promise<CacheEntry> {
  const { minNetSpreadPct, useDeepSeek, skinNames } = params;
  const allOpportunities: SkinOpportunity[] = [];
  const errors: string[] = [];
  let scrapedSkins = 0;

  for (const skinName of skinNames) {
    try {
      const results = await scrapeAll(skinName);

      // Collect scraper-level errors
      for (const r of results) {
        if (r.errors?.length) errors.push(...r.errors);
      }

      const opps = await detectOpportunities(results, minNetSpreadPct, useDeepSeek);
      allOpportunities.push(...opps);
      scrapedSkins++;
    } catch (err) {
      errors.push(`${skinName}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    opportunities: allOpportunities.sort((a, b) => b.netSpreadPct - a.netSpreadPct),
    scrapedSkins,
    scrapedAt: new Date().toISOString(),
    errors: [...new Set(errors)], // deduplicate
  };
}

// ── Cache-aware getter ────────────────────────────────────────────────────────

async function getCachedOrCompute(params: {
  minNetSpreadPct: number;
  useDeepSeek: boolean;
  skinNames: string[];
  ttlMs: number;
}): Promise<{ data: CacheEntry; cacheHit: boolean; ageMs: number }> {
  const key = cacheKey({ minNetSpreadPct: params.minNetSpreadPct, useDeepSeek: params.useDeepSeek });
  const now = Date.now();

  if (cache && cache.key === key) {
    const ageMs = now - cache.createdAt;
    if (ageMs < cache.ttlMs) {
      return { data: cache.data, cacheHit: true, ageMs };
    }
  }

  if (!inFlight) {
    inFlight = computeOpportunities(params).finally(() => { inFlight = null; });
  }

  const data = await inFlight;
  cache = { key, createdAt: Date.now(), ttlMs: params.ttlMs, data };
  return { data, cacheHit: false, ageMs: 0 };
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface GetOpportunitiesOptions {
  minNetSpreadPct?: number;
  useDeepSeek?: boolean;
  limit?: number;
  debug?: boolean;
  ttlMs?: number;
  /** Override the default hot-skin list */
  skinNames?: string[];
}

export interface OpportunitiesMeta {
  markets: Marketplace[];
  scrapedSkins: number;
  scrapedAt: string;
  minNetSpreadPct: number;
  useDeepSeek: boolean;
  limit: number;
  cache?: { hit: boolean; ageMs: number; ttlMs: number };
  errors?: string[];
}

export async function getOpportunities(opts?: GetOpportunitiesOptions): Promise<{
  opportunities: SkinOpportunity[];
  meta: OpportunitiesMeta;
}> {
  const minNetSpreadPct = opts?.minNetSpreadPct ?? 5;
  const useDeepSeek = opts?.useDeepSeek ?? true;
  const limit = opts?.limit ?? 20;
  const debug = opts?.debug ?? false;
  const ttlMs = opts?.ttlMs ?? DEFAULT_CACHE_TTL_MS;
  const skinNames = opts?.skinNames ?? getHotSkinNames();

  const { data, cacheHit, ageMs } = await getCachedOrCompute({ minNetSpreadPct, useDeepSeek, skinNames, ttlMs });

  const meta: OpportunitiesMeta = {
    markets: getAvailableScrapers(),
    scrapedSkins: data.scrapedSkins,
    scrapedAt: data.scrapedAt,
    minNetSpreadPct,
    useDeepSeek,
    limit,
    ...(debug ? { cache: { hit: cacheHit, ageMs, ttlMs }, errors: data.errors } : {}),
  };

  return { opportunities: data.opportunities.slice(0, limit), meta };
}

/**
 * On-demand scan of a single skin (bypasses the hot-skin cache).
 */
export async function scanSkin(skinName: string, opts?: { useDeepSeek?: boolean; minNetSpreadPct?: number }): Promise<{
  skinName: string;
  opportunities: SkinOpportunity[];
  errors: string[];
  scrapedAt: string;
}> {
  const useDeepSeek = opts?.useDeepSeek ?? true;
  const minNetSpreadPct = opts?.minNetSpreadPct ?? 0; // return all for single-skin requests
  const results = await scrapeAll(skinName);
  const errors = results.flatMap(r => r.errors ?? []);
  const opportunities = await detectOpportunities(results, minNetSpreadPct, useDeepSeek);

  return { skinName, opportunities, errors: [...new Set(errors)], scrapedAt: new Date().toISOString() };
}

export function getMarkets(): Marketplace[] {
  return getAvailableScrapers();
}

export function getHotSkins() {
  return HOT_SKINS;
}

/** Bust the cache (useful after config changes or forced refresh) */
export function bustCache(): void {
  cache = undefined;
}

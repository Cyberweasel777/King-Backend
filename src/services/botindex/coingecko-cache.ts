/**
 * Shared CoinGecko Cache — single fetch layer for all services.
 * Prevents duplicate API calls and handles 429 gracefully.
 */
import logger from '../../config/logger';

const FETCH_TIMEOUT_MS = 10_000;
const TRENDING_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min
const PRICE_CACHE_TTL_MS = 60 * 1000; // 1 min
const MIN_REQUEST_GAP_MS = 1500; // minimum gap between CoinGecko calls

// Asset ID mapping (single source of truth)
export const ASSET_TO_COINGECKO: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', KAS: 'kaspa',
  STX: 'blockstack', ORDI: 'ordi', BABY: 'babylon', HYPE: 'hyperliquid',
  PURR: 'purr-2', ZORA: 'zora-2', AAVE: 'aave', UNI: 'uniswap',
  LINK: 'chainlink', ARB: 'arbitrum', OP: 'optimism', POL: 'matic-network',
  BASE: 'base', PUMP: 'pump-fun',
};

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

let trendingCache: CacheEntry<any> | null = null;
const priceCache = new Map<string, CacheEntry<number | null>>();
let lastRequestAt = 0;
let rateLimitedUntil = 0; // timestamp when 429 backoff expires

async function rateLimitedFetch(url: string): Promise<Response | null> {
  const now = Date.now();

  // If we are in 429 backoff, skip
  if (now < rateLimitedUntil) {
    logger.debug({ url, backoffRemaining: rateLimitedUntil - now }, 'CoinGecko: skipping (429 backoff)');
    return null;
  }

  // Enforce minimum gap between requests
  const gap = now - lastRequestAt;
  if (gap < MIN_REQUEST_GAP_MS) {
    await new Promise(r => setTimeout(r, MIN_REQUEST_GAP_MS - gap));
  }
  lastRequestAt = Date.now();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (res.status === 429) {
      // Back off for 2 minutes on 429
      rateLimitedUntil = Date.now() + 2 * 60 * 1000;
      logger.warn({ url }, 'CoinGecko 429 — backing off 2 minutes');
      return null;
    }
    if (!res.ok) {
      logger.warn({ url, status: res.status }, 'CoinGecko non-200');
      return null;
    }
    return res;
  } catch (err) {
    clearTimeout(timer);
    logger.warn({ url, err: err instanceof Error ? err.message : String(err) }, 'CoinGecko fetch failed');
    return null;
  }
}

/**
 * Get trending coins — cached for 5 minutes, shared across all services.
 * Returns null (not stale data) on 429 to prevent false "new trending" alerts.
 */
export async function getTrending(): Promise<any | null> {
  const now = Date.now();
  if (trendingCache && (now - trendingCache.fetchedAt) < TRENDING_CACHE_TTL_MS) {
    return trendingCache.data;
  }

  const res = await rateLimitedFetch('https://api.coingecko.com/api/v3/search/trending');
  if (!res) return trendingCache?.data ?? null; // return stale cache if available, null if not

  const data = await res.json();
  trendingCache = { data, fetchedAt: Date.now() };
  return data;
}

/**
 * Returns whether the last trending fetch was fresh or stale/failed.
 * Use this to suppress "new trending" alerts when data is stale.
 */
export function isTrendingFresh(): boolean {
  if (!trendingCache) return false;
  return (Date.now() - trendingCache.fetchedAt) < TRENDING_CACHE_TTL_MS;
}

/**
 * Get price for a single asset — cached for 1 minute.
 */
export async function getPrice(asset: string): Promise<number | null> {
  const cgId = ASSET_TO_COINGECKO[asset.toUpperCase()];
  if (!cgId) return null;

  const now = Date.now();
  const cached = priceCache.get(cgId);
  if (cached && (now - cached.fetchedAt) < PRICE_CACHE_TTL_MS) {
    return cached.data;
  }

  const res = await rateLimitedFetch(`https://api.coingecko.com/api/v3/simple/price?ids=${cgId}&vs_currencies=usd`);
  if (!res) return cached?.data ?? null;

  const data = await res.json() as Record<string, { usd: number }>;
  const price = data[cgId]?.usd ?? null;
  priceCache.set(cgId, { data: price, fetchedAt: Date.now() });
  return price;
}

/**
 * Batch price fetch — deduplicates and rate-limits.
 */
export async function getPrices(assets: string[]): Promise<Record<string, number | null>> {
  const unique = [...new Set(assets.map(a => a.toUpperCase()))];
  const results: Record<string, number | null> = {};

  // Collect all CoinGecko IDs that need fetching
  const toFetch: string[] = [];
  const now = Date.now();
  for (const asset of unique) {
    const cgId = ASSET_TO_COINGECKO[asset];
    if (!cgId) {
      results[asset] = null;
      continue;
    }
    const cached = priceCache.get(cgId);
    if (cached && (now - cached.fetchedAt) < PRICE_CACHE_TTL_MS) {
      results[asset] = cached.data;
    } else {
      toFetch.push(asset);
    }
  }

  if (toFetch.length > 0) {
    // Batch fetch all uncached in one call
    const ids = toFetch.map(a => ASSET_TO_COINGECKO[a]).filter(Boolean).join(',');
    if (ids) {
      const res = await rateLimitedFetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`);
      if (res) {
        const data = await res.json() as Record<string, { usd: number }>;
        for (const asset of toFetch) {
          const cgId = ASSET_TO_COINGECKO[asset];
          if (!cgId) continue;
          const price = data[cgId]?.usd ?? null;
          priceCache.set(cgId, { data: price, fetchedAt: Date.now() });
          results[asset] = price;
        }
      } else {
        // Use stale cache or null
        for (const asset of toFetch) {
          const cgId = ASSET_TO_COINGECKO[asset];
          const cached = cgId ? priceCache.get(cgId) : null;
          results[asset] = cached?.data ?? null;
        }
      }
    }
  }

  return results;
}

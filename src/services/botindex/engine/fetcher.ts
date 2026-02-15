/**
 * BotIndex Price Data Fetcher
 * Fetches OHLCV data from DEX Screener and GeckoTerminal
 */

import type { OHLCVPoint, PriceSeries, PriceDataSource } from '../engine/types';

// API endpoints
const DEXSCREENER_API = 'https://api.dexscreener.com/latest';
const GECKOTERMINAL_API = 'https://api.geckoterminal.com/api/v2';

// Rate limiting
const RATE_LIMIT_DELAY = 100; // ms between requests

// Cache configuration
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  data: PriceSeries;
  fetchedAt: number;
}

const priceCache = new Map<string, CacheEntry>();

/**
 * Resolve the most liquid pool/pair for a token mint using DEXScreener.
 * Returns a pool/pair address suitable for GeckoTerminal /pools/{id} calls.
 */
async function resolveTopPoolFromDexscreener(chain: string, tokenAddress: string): Promise<string | null> {
  try {
    const url = `${DEXSCREENER_API}/dex/tokens/${tokenAddress}`;
    await rateLimit();
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'BotIndex/1.0'
      }
    });
    if (!res.ok) return null;
    const data = await res.json() as { pairs?: any[] };
    if (!data.pairs || data.pairs.length === 0) return null;

    // Prefer matching chain, then highest liquidity
    const pairs = data.pairs
      .filter((p: any) => !p.chainId || String(p.chainId).toLowerCase() === String(chain).toLowerCase());

    const best = (pairs.length ? pairs : data.pairs)
      .sort((a: any, b: any) => parseFloat(b.liquidity?.usd || 0) - parseFloat(a.liquidity?.usd || 0))[0];

    // DEXScreener uses pairAddress for pools
    return best?.pairAddress || null;
  } catch {
    return null;
  }
}

/**
 * Fetch price series for a token
 * @param token - Token identifier (chain:address or symbol)
 * @param window - Time window (1h, 24h, 7d, 30d)
 * @param source - Preferred data source
 * @returns Price series with OHLCV data
 */
export async function fetchPriceSeries(
  token: string,
  window: '1h' | '24h' | '7d' | '30d' = '24h',
  source: PriceDataSource['name'] = 'dexscreener'
): Promise<PriceSeries | null> {
  const cacheKey = `${token}:${window}:${source}`;
  
  // Check cache
  const cached = priceCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    let result: PriceSeries | null = null;

    if (source === 'dexscreener' || source === 'fallback') {
      result = await fetchFromDEXScreener(token, window);
    }

    if (!result && (source === 'geckoterminal' || source === 'fallback')) {
      result = await fetchFromGeckoTerminal(token, window);
    }

    if (result) {
      priceCache.set(cacheKey, { data: result, fetchedAt: Date.now() });
    }

    return result;
  } catch (error) {
    console.error(`Failed to fetch price for ${token}:`, error);
    return null;
  }
}

/**
 * Fetch OHLCV data from DEX Screener
 * @param token - Token identifier
 * @param window - Time window
 * @returns Price series or null
 */
async function fetchFromDEXScreener(
  token: string,
  _window: '1h' | '24h' | '7d' | '30d'
): Promise<PriceSeries | null> {
  try {
    // Parse token identifier (chain:address format)
    const [chain, address] = token.includes(':') 
      ? token.split(':') 
      : ['solana', token]; // Default to solana if no chain specified

    // Build API URL
    // NOTE: DEXScreener /dex/pairs expects a *pair address*, not a token mint.
    // We use /dex/tokens to resolve pairs for a token mint.
    const url = `${DEXSCREENER_API}/dex/tokens/${address}`;
    
    await rateLimit();
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'BotIndex/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`DEXScreener API error: ${response.status}`);
    }

    const data = await response.json() as { pairs?: any[] };
    
    if (!data.pairs || data.pairs.length === 0) {
      return null;
    }

    // Get the pair with highest liquidity
    const pair = data.pairs.sort((a: any, b: any) => 
      parseFloat(b.liquidity?.usd || 0) - parseFloat(a.liquidity?.usd || 0)
    )[0];

    // Convert to OHLCV points
    // DEXScreener returns 24h data in the response
    const ohlcv: OHLCVPoint[] = [];

    // If we have historical data in the response
    if (pair.historical) {
      for (const point of pair.historical) {
        ohlcv.push({
          timestamp: point.timestamp,
          open: parseFloat(point.open),
          high: parseFloat(point.high),
          low: parseFloat(point.low),
          close: parseFloat(point.close),
          volume: parseFloat(point.volume)
        });
      }
    } else {
      // Construct single point from current data
      ohlcv.push({
        timestamp: Date.now(),
        open: parseFloat(pair.priceNative),
        high: parseFloat(pair.priceNative),
        low: parseFloat(pair.priceNative),
        close: parseFloat(pair.priceNative),
        volume: parseFloat(pair.volume?.h24 || 0)
      });
    }

    return {
      token: address,
      chain,
      data: ohlcv,
      lastUpdated: Date.now()
    };
  } catch (error) {
    console.error('DEXScreener fetch error:', error);
    return null;
  }
}

/**
 * Fetch OHLCV data from GeckoTerminal
 * @param token - Token identifier
 * @param window - Time window
 * @returns Price series or null
 */
async function fetchFromGeckoTerminal(
  token: string,
  window: '1h' | '24h' | '7d' | '30d'
): Promise<PriceSeries | null> {
  try {
    // Parse token identifier
    const [chain, address] = token.includes(':') 
      ? token.split(':') 
      : ['solana', token];

    // Map window to GeckoTerminal timeframe
    const timeframeMap: Record<string, string> = {
      '1h': 'minute',
      '24h': 'hour',
      '7d': 'hour',
      '30d': 'day'
    };

    const timeframe = timeframeMap[window] || 'hour';
    
    // Calculate limit based on window
    const limitMap: Record<string, number> = {
      '1h': 60,
      '24h': 24,
      '7d': 168,
      '30d': 30
    };
    
    const limit = Math.min(limitMap[window] || 24, 1000);

    // Build API URL
    // GeckoTerminal OHLCV endpoint expects a *pool address*, not a token mint.
    // Resolve a likely pool via DEXScreener, then request OHLCV for that pool.
    const resolvedPool = await resolveTopPoolFromDexscreener(chain, address);
    if (!resolvedPool) return null;

    const url = `${GECKOTERMINAL_API}/networks/${chain}/pools/${resolvedPool}/ohlcv/${timeframe}?limit=${limit}`;
    
    await rateLimit();
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'BotIndex/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`GeckoTerminal API error: ${response.status}`);
    }

    const data = await response.json() as { data?: { attributes?: { ohlcv_list?: number[][] } } };
    
    if (!data.data?.attributes?.ohlcv_list) {
      return null;
    }

    const ohlcvList = data.data.attributes.ohlcv_list;
    const ohlcv: OHLCVPoint[] = [];

    for (const point of ohlcvList) {
      // GeckoTerminal returns: [timestamp, open, high, low, close, volume]
      ohlcv.push({
        timestamp: (point as number[])[0] * 1000, // Convert to milliseconds
        open: parseFloat(String((point as number[])[1])),
        high: parseFloat(String((point as number[])[2])),
        low: parseFloat(String((point as number[])[3])),
        close: parseFloat(String((point as number[])[4])),
        volume: parseFloat(String((point as number[])[5]))
      });
    }

    return {
      token: address,
      chain,
      data: ohlcv,
      lastUpdated: Date.now()
    };
  } catch (error) {
    console.error('GeckoTerminal fetch error:', error);
    return null;
  }
}

/**
 * Fetch price series for multiple tokens
 * @param tokens - Array of token identifiers
 * @param window - Time window
 * @returns Map of token to price series
 */
export async function fetchMultiplePriceSeries(
  tokens: string[],
  window: '1h' | '24h' | '7d' | '30d' = '24h'
): Promise<Map<string, PriceSeries>> {
  const results = new Map<string, PriceSeries>();

  // Fetch in batches to avoid rate limits
  const BATCH_SIZE = 5;
  
  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    const batch = tokens.slice(i, i + BATCH_SIZE);
    
    const batchResults = await Promise.all(
      batch.map(async (token) => {
        const series = await fetchPriceSeries(token, window);
        return { token, series };
      })
    );

    for (const { token, series } of batchResults) {
      if (series) {
        results.set(token, series);
      }
    }

    // Rate limit between batches
    if (i + BATCH_SIZE < tokens.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return results;
}

/**
 * Get aggregated price from multiple sources
 * @param token - Token identifier
 * @returns Aggregated price data
 */
export async function getAggregatedPrice(
  token: string
): Promise<{ price: number; volume24h: number; liquidity: number; sources: number } | null> {
  try {
    const [chain, address] = token.includes(':') 
      ? token.split(':') 
      : ['solana', token];

    // Try DEXScreener first
    await rateLimit();
    
    const dexResponse = await fetch(
      `${DEXSCREENER_API}/dex/tokens/${address}`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'BotIndex/1.0'
        }
      }
    );

    if (dexResponse.ok) {
      const data = await dexResponse.json() as { pairs?: any[] };
      
      if (data.pairs && data.pairs.length > 0) {
        // Aggregate across all pairs
        let totalVolume = 0;
        let totalLiquidity = 0;
        let weightedPrice = 0;
        let totalWeight = 0;

        for (const pair of data.pairs) {
          const liquidity = parseFloat(pair.liquidity?.usd || 0);
          const volume = parseFloat(pair.volume?.h24 || 0);
          const price = parseFloat(pair.priceUsd || pair.priceNative || 0);

          if (price > 0) {
            totalVolume += volume;
            totalLiquidity += liquidity;
            weightedPrice += price * liquidity;
            totalWeight += liquidity;
          }
        }

        return {
          price: totalWeight > 0 ? weightedPrice / totalWeight : 0,
          volume24h: totalVolume,
          liquidity: totalLiquidity,
          sources: data.pairs.length
        };
      }
    }

    return null;
  } catch (error) {
    console.error('Failed to get aggregated price:', error);
    return null;
  }
}

/**
 * Search for tokens by symbol or name
 * @param query - Search query
 * @returns Array of matching tokens
 */
export async function searchTokens(
  query: string
): Promise<{ address: string; chain: string; symbol: string; name: string }[]> {
  try {
    await rateLimit();
    
    const response = await fetch(
      `${DEXSCREENER_API}/dex/search?q=${encodeURIComponent(query)}`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'BotIndex/1.0'
        }
      }
    );

    if (!response.ok) {
      return [];
    }

    const data = await response.json() as { pairs?: any[] };
    const results: { address: string; chain: string; symbol: string; name: string }[] = [];

    if (data.pairs) {
      for (const pair of data.pairs.slice(0, 10)) {
        const baseToken = pair.baseToken;
        results.push({
          address: baseToken.address,
          chain: pair.chainId || 'solana',
          symbol: baseToken.symbol,
          name: baseToken.name
        });
      }
    }

    // Remove duplicates
    const seen = new Set<string>();
    return results.filter(r => {
      const key = `${r.chain}:${r.address}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch (error) {
    console.error('Token search error:', error);
    return [];
  }
}

/**
 * Clear price cache
 */
export function clearPriceCache(): void {
  priceCache.clear();
}

/**
 * Get cache statistics
 */
export function getCacheStats(): {
  size: number;
  oldestEntry: number;
  newestEntry: number;
} {
  const entries = Array.from(priceCache.values());
  
  if (entries.length === 0) {
    return { size: 0, oldestEntry: 0, newestEntry: 0 };
  }

  const timestamps = entries.map(e => e.fetchedAt);
  
  return {
    size: entries.length,
    oldestEntry: Math.min(...timestamps),
    newestEntry: Math.max(...timestamps)
  };
}

// Rate limiting
let lastRequestTime = 0;

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  
  if (elapsed < RATE_LIMIT_DELAY) {
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY - elapsed));
  }
  
  lastRequestTime = Date.now();
}

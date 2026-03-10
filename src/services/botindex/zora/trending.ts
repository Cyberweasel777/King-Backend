/**
 * Zora Trending Coins — LIVE data from Zora REST API.
 *
 * Source: https://api-sdk.zora.engineering/explore?listType=TOP_VOLUME_24H
 * Docs: https://docs.zora.co/coins/sdk/queries/explore
 *
 * Returns top coins by 24h trading volume with market cap, holder count,
 * and price changes.
 */

import logger from '../../../config/logger';

export type ZoraTrendingCoin = {
  address: string;
  name: string;
  symbol: string;
  creatorAddress: string;
  creatorHandle: string | null;
  volume24h: number;
  totalVolume: number;
  marketCap: number;
  marketCapDelta24h: number;
  uniqueHolders: number;
  createdAt: string;
  chainId: number;
  coinType: string;
};

export type ZoraTrendingSource = 'live' | 'error';

export type ZoraTrendingCoinsResponse = {
  coins: ZoraTrendingCoin[];
  source: ZoraTrendingSource;
  count: number;
  fetchedAt: string;
};

const ZORA_EXPLORE_URL = 'https://api-sdk.zora.engineering/explore';
const ZORA_API_KEY = process.env.ZORA_API_KEY || '';
const CACHE_TTL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10000;

const trendingCache = new Map<number, { data: ZoraTrendingCoinsResponse; expiresAt: number }>();

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit < 1) return 10;
  return Math.min(Math.floor(limit), 50);
}

function parseCoinNode(node: any): ZoraTrendingCoin | null {
  if (!node || !node.address || !node.name) return null;

  return {
    address: node.address,
    name: node.name || '',
    symbol: (node.symbol || '').toUpperCase(),
    creatorAddress: node.creatorAddress || '',
    creatorHandle: node.creatorProfile?.handle || null,
    volume24h: round(toNumber(node.volume24h), 2),
    totalVolume: round(toNumber(node.totalVolume), 2),
    marketCap: round(toNumber(node.marketCap), 2),
    marketCapDelta24h: round(toNumber(node.marketCapDelta24h), 2),
    uniqueHolders: Math.max(0, Math.floor(toNumber(node.uniqueHolders))),
    createdAt: node.createdAt || '',
    chainId: node.chainId || 8453,
    coinType: node.coinType || 'UNKNOWN',
  };
}

async function fetchLiveTrending(limit: number): Promise<ZoraTrendingCoin[]> {
  const url = new URL(ZORA_EXPLORE_URL);
  url.searchParams.set('listType', 'TOP_VOLUME_24H');
  url.searchParams.set('count', String(limit));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (ZORA_API_KEY) {
      headers['api-key'] = ZORA_API_KEY;
    }

    const response = await fetch(url.toString(), {
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Zora API returned ${response.status}: ${await response.text()}`);
    }

    const payload = await response.json() as any;
    const edges = payload?.exploreList?.edges || payload?.data?.exploreList?.edges || [];

    const coins: ZoraTrendingCoin[] = [];
    for (const edge of edges) {
      const coin = parseCoinNode(edge?.node);
      if (coin && coin.volume24h > 0) {
        coins.push(coin);
      }
    }

    coins.sort((a, b) => b.volume24h - a.volume24h);
    return coins;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getZoraTrendingCoins(limit: number): Promise<ZoraTrendingCoinsResponse> {
  const normalizedLimit = normalizeLimit(limit);
  const now = Date.now();
  const cached = trendingCache.get(normalizedLimit);

  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  try {
    const coins = await fetchLiveTrending(normalizedLimit);
    const data: ZoraTrendingCoinsResponse = {
      coins,
      source: 'live',
      count: coins.length,
      fetchedAt: new Date().toISOString(),
    };

    logger.info({ count: coins.length, topCoin: coins[0]?.symbol }, 'Fetched live Zora trending coins');
    trendingCache.set(normalizedLimit, { data, expiresAt: now + CACHE_TTL_MS });
    return data;
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch Zora trending coins');

    // Return cached data if available (even if stale)
    if (cached) {
      return cached.data;
    }

    return {
      coins: [],
      source: 'error',
      count: 0,
      fetchedAt: new Date().toISOString(),
    };
  }
}

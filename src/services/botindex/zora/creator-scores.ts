/**
 * Zora Creator Scores — LIVE data from Zora REST API.
 *
 * Fetches the most valuable creator coins and scores them based on
 * market cap, volume, and holder metrics.
 *
 * Source: https://api-sdk.zora.engineering/explore?listType=MOST_VALUABLE_CREATORS
 * Docs: https://docs.zora.co/coins/sdk/queries/explore
 */

import logger from '../../../config/logger';

export type ZoraCreatorScore = {
  address: string;
  creatorAddress: string;
  handle: string | null;
  coinSymbol: string;
  name: string;
  marketCap: number;
  volume24h: number;
  totalVolume: number;
  uniqueHolders: number;
  marketCapDelta24h: number;
  score: number;
};

export type ZoraCreatorScoresResponse = {
  creators: ZoraCreatorScore[];
  source: 'live' | 'error';
  count: number;
  fetchedAt: string;
};

const ZORA_EXPLORE_URL = 'https://api-sdk.zora.engineering/explore';
const ZORA_API_KEY = process.env.ZORA_API_KEY || '';
const CACHE_TTL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10000;

const creatorCache = new Map<number, { data: ZoraCreatorScoresResponse; expiresAt: number }>();

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

function computeCreatorScore(marketCap: number, volume24h: number, holders: number, delta24h: number): number {
  // Weighted score: market cap (40%) + volume (30%) + holders (20%) + momentum (10%)
  const mcScore = Math.min(40, (marketCap / 1_000_000) * 40); // scale: $1M = 40 pts
  const volScore = Math.min(30, (volume24h / 100_000) * 30);   // scale: $100k = 30 pts
  const holderScore = Math.min(20, (holders / 5000) * 20);      // scale: 5k holders = 20 pts
  const momentumScore = delta24h > 0 ? Math.min(10, (delta24h / 50_000) * 10) : 0;

  return round(Math.min(100, mcScore + volScore + holderScore + momentumScore), 2);
}

export async function getZoraCreatorScores(limit: number): Promise<ZoraCreatorScoresResponse> {
  const normalizedLimit = normalizeLimit(limit);
  const now = Date.now();
  const cached = creatorCache.get(normalizedLimit);

  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  try {
    const url = new URL(ZORA_EXPLORE_URL);
    url.searchParams.set('listType', 'MOST_VALUABLE_CREATORS');
    url.searchParams.set('count', String(normalizedLimit));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let nodes: any[];
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
        throw new Error(`Zora API (MOST_VALUABLE_CREATORS) returned ${response.status}`);
      }

      const payload = await response.json() as any;
      const edges = payload?.exploreList?.edges || payload?.data?.exploreList?.edges || [];
      nodes = edges.map((e: any) => e?.node).filter(Boolean);
    } finally {
      clearTimeout(timeout);
    }

    const creators: ZoraCreatorScore[] = [];
    for (const node of nodes) {
      if (!node.address) continue;

      const marketCap = toNumber(node.marketCap);
      const volume24h = toNumber(node.volume24h);
      const totalVolume = toNumber(node.totalVolume);
      const holders = Math.max(0, Math.floor(toNumber(node.uniqueHolders)));
      const delta24h = toNumber(node.marketCapDelta24h);

      creators.push({
        address: node.address,
        creatorAddress: node.creatorAddress || '',
        handle: node.creatorProfile?.handle || null,
        coinSymbol: (node.symbol || '').toUpperCase(),
        name: node.name || '',
        marketCap: round(marketCap, 2),
        volume24h: round(volume24h, 2),
        totalVolume: round(totalVolume, 2),
        uniqueHolders: holders,
        marketCapDelta24h: round(delta24h, 2),
        score: computeCreatorScore(marketCap, volume24h, holders, delta24h),
      });
    }

    creators.sort((a, b) => b.score - a.score);

    const data: ZoraCreatorScoresResponse = {
      creators,
      source: 'live',
      count: creators.length,
      fetchedAt: new Date().toISOString(),
    };

    logger.info({ count: creators.length, topCreator: creators[0]?.handle }, 'Fetched live Zora creator scores');
    creatorCache.set(normalizedLimit, { data, expiresAt: now + CACHE_TTL_MS });
    return data;
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch Zora creator scores');

    if (cached) {
      return cached.data;
    }

    return {
      creators: [],
      source: 'error',
      count: 0,
      fetchedAt: new Date().toISOString(),
    };
  }
}

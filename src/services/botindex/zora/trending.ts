import logger from '../../../config/logger';

export type ZoraTrendingCoin = {
  address: string;
  name: string;
  symbol: string;
  volume24h: number;
  priceChange1h: number;
  priceChange24h: number;
  holders: number;
  tradingFees24h: number;
};

export type ZoraTrendingCoinsResponse = {
  coins: ZoraTrendingCoin[];
};

const ZORA_API_URL = 'https://api.zora.co/universal/graphql';
const CACHE_TTL_MS = 5 * 60 * 1000;

const trendingCache = new Map<number, { data: ZoraTrendingCoinsResponse; expiresAt: number }>();

function toRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null) return null;
  return value as Record<string, unknown>;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function toStringValue(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  return null;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit < 1) return 10;
  return Math.min(Math.floor(limit), 50);
}

function parseTrendingCoin(node: unknown): ZoraTrendingCoin | null {
  const record = toRecord(node);
  if (!record) return null;

  const stats = toRecord(record.stats);
  const marketStats = toRecord(record.marketStats);

  const address = toStringValue(record.address ?? record.coinAddress ?? record.contractAddress);
  const name = toStringValue(record.name);
  const symbol = toStringValue(record.symbol ?? record.ticker);
  const volume24h = toNumber(record.volume24h ?? stats?.volume24h ?? marketStats?.volume24hUsd);
  const priceChange1h = toNumber(record.priceChange1h ?? stats?.priceChange1h);
  const priceChange24h = toNumber(record.priceChange24h ?? stats?.priceChange24h);
  const holders = toNumber(record.holders ?? stats?.holders ?? marketStats?.holderCount);
  const tradingFees24h = toNumber(
    record.tradingFees24h ?? stats?.tradingFees24h ?? stats?.creatorFees24h
  );

  if (
    !address ||
    !name ||
    !symbol ||
    volume24h === null ||
    priceChange1h === null ||
    priceChange24h === null ||
    holders === null ||
    tradingFees24h === null
  ) {
    return null;
  }

  return {
    address,
    name,
    symbol: symbol.toUpperCase(),
    volume24h: round(volume24h, 2),
    priceChange1h: round(priceChange1h, 2),
    priceChange24h: round(priceChange24h, 2),
    holders: Math.floor(holders),
    tradingFees24h: round(tradingFees24h, 2),
  };
}

function extractCoinsFromPayload(payload: unknown): ZoraTrendingCoin[] {
  const root = toRecord(payload);
  if (!root) return [];

  const maybeData = toRecord(root.data) ?? root;
  const candidates: unknown[] = [];

  const directArrays = ['coins', 'trendingCoins', 'trending', 'results'];
  for (const key of directArrays) {
    const value = maybeData[key];
    if (Array.isArray(value)) {
      candidates.push(...value);
    }
  }

  const exploreList = toRecord(maybeData.exploreList);
  if (exploreList && Array.isArray(exploreList.edges)) {
    for (const edge of exploreList.edges) {
      const edgeRecord = toRecord(edge);
      if (!edgeRecord) continue;
      candidates.push(edgeRecord.node ?? edgeRecord);
    }
  }

  const seen = new Set<string>();
  const parsed: ZoraTrendingCoin[] = [];

  for (const candidate of candidates) {
    const coin = parseTrendingCoin(candidate);
    if (!coin) continue;
    if (seen.has(coin.address.toLowerCase())) continue;
    seen.add(coin.address.toLowerCase());
    parsed.push(coin);
  }

  return parsed;
}

async function fetchFromZora(limit: number): Promise<ZoraTrendingCoin[] | null> {
  // TODO: Replace this generic query with Zora's stable trending endpoint when finalized.
  const query = `
    query BotIndexTrendingCoins($limit: Int!) {
      coins(limit: $limit) {
        address
        name
        symbol
        volume24h
        priceChange1h
        priceChange24h
        holders
        tradingFees24h
      }
    }
  `;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(ZORA_API_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables: { limit } }),
      signal: controller.signal,
    });

    if (!response.ok) {
      logger.warn({ status: response.status }, 'Zora trending query failed');
      return null;
    }

    const payload = (await response.json()) as unknown;
    const coins = extractCoinsFromPayload(payload);
    if (coins.length === 0) {
      return null;
    }
    return coins.slice(0, limit);
  } catch (error) {
    logger.warn({ err: error }, 'Zora API unreachable, using mock trending payload');
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function getMockTrendingCoins(limit: number): ZoraTrendingCoin[] {
  const seedCoins: ZoraTrendingCoin[] = [
    {
      address: '0x1111111111111111111111111111111111111111',
      name: 'Base Builder Collective',
      symbol: 'BBC',
      volume24h: 1823400.12,
      priceChange1h: 3.72,
      priceChange24h: 21.45,
      holders: 12842,
      tradingFees24h: 14587.3,
    },
    {
      address: '0x2222222222222222222222222222222222222222',
      name: 'Culture Ledger',
      symbol: 'CLTR',
      volume24h: 1498912.4,
      priceChange1h: 2.14,
      priceChange24h: 15.26,
      holders: 10115,
      tradingFees24h: 12042.8,
    },
    {
      address: '0x3333333333333333333333333333333333333333',
      name: 'Onchain Posters',
      symbol: 'POST',
      volume24h: 1264530.88,
      priceChange1h: 0.92,
      priceChange24h: 8.44,
      holders: 9670,
      tradingFees24h: 10621.43,
    },
    {
      address: '0x4444444444444444444444444444444444444444',
      name: 'Meme Ledger',
      symbol: 'MEME',
      volume24h: 1104008.61,
      priceChange1h: -1.17,
      priceChange24h: 4.05,
      holders: 8391,
      tradingFees24h: 9298.03,
    },
    {
      address: '0x5555555555555555555555555555555555555555',
      name: 'Creator Pass',
      symbol: 'CPASS',
      volume24h: 958220.73,
      priceChange1h: 1.63,
      priceChange24h: 11.8,
      holders: 7609,
      tradingFees24h: 8514.71,
    },
    {
      address: '0x6666666666666666666666666666666666666666',
      name: 'Sound Capsule',
      symbol: 'SOUND',
      volume24h: 835934.77,
      priceChange1h: 0.41,
      priceChange24h: 6.13,
      holders: 6904,
      tradingFees24h: 7681.6,
    },
    {
      address: '0x7777777777777777777777777777777777777777',
      name: 'Canvas Coin',
      symbol: 'CNVS',
      volume24h: 744130.11,
      priceChange1h: -0.37,
      priceChange24h: 2.92,
      holders: 6288,
      tradingFees24h: 7015.22,
    },
    {
      address: '0x8888888888888888888888888888888888888888',
      name: 'Open Edition Index',
      symbol: 'OEI',
      volume24h: 658921.45,
      priceChange1h: 0.19,
      priceChange24h: -1.04,
      holders: 5741,
      tradingFees24h: 6240.55,
    },
  ];

  return seedCoins.slice(0, limit);
}

export async function getZoraTrendingCoins(limit: number): Promise<ZoraTrendingCoinsResponse> {
  const normalizedLimit = normalizeLimit(limit);
  const now = Date.now();
  const cached = trendingCache.get(normalizedLimit);

  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const apiCoins = await fetchFromZora(normalizedLimit);
  const data: ZoraTrendingCoinsResponse = {
    coins: apiCoins && apiCoins.length > 0 ? apiCoins : getMockTrendingCoins(normalizedLimit),
  };

  trendingCache.set(normalizedLimit, {
    data,
    expiresAt: now + CACHE_TTL_MS,
  });

  return data;
}

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

export type ZoraTrendingSource = 'live' | 'mock';

export type ZoraTrendingCoinsResponse = {
  coins: ZoraTrendingCoin[];
  source: ZoraTrendingSource;
  provider: 'zora_graphql' | 'zora_rest' | 'mock_seed';
};

type ZoraLiveFetchResult = {
  coins: ZoraTrendingCoin[];
  provider: 'zora_graphql' | 'zora_rest';
};

const ZORA_GRAPHQL_API_URL = 'https://api.zora.co/universal/graphql';
const ZORA_REST_EXPLORE_URLS = [
  'https://api-sdk.zora.engineering/explore',
  'https://api-sdk.zora.engineering/api/explore',
] as const;
const CACHE_TTL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 7000;

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

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const parsed = toStringValue(value);
    if (parsed) return parsed;
  }
  return null;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = toNumber(value);
    if (parsed !== null) return parsed;
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

  const coin = toRecord(record.coin);
  const stats = toRecord(record.stats) ?? toRecord(coin?.stats);
  const marketStats = toRecord(record.marketStats) ?? toRecord(coin?.marketStats);
  const metrics = toRecord(record.metrics);
  const price = toRecord(record.price);
  const change = toRecord(record.change);
  const volume = toRecord(record.volume);

  const address = firstString(
    record.address,
    record.coinAddress,
    record.contractAddress,
    record.tokenAddress,
    coin?.address,
    coin?.coinAddress,
    coin?.contractAddress
  );
  const name = firstString(record.name, record.coinName, coin?.name);
  const symbol = firstString(record.symbol, record.ticker, coin?.symbol, coin?.ticker);
  const volume24h = firstNumber(
    record.volume24h,
    record.volume24H,
    record.volume_24h,
    record.volume24hUsd,
    record.volume24hUSD,
    stats?.volume24h,
    stats?.volume24hUsd,
    marketStats?.volume24hUsd,
    metrics?.volume24h,
    metrics?.volume24hUsd,
    volume?.h24,
    volume?.day
  );
  const priceChange1h =
    firstNumber(
      record.priceChange1h,
      record.price_change_1h,
      stats?.priceChange1h,
      marketStats?.priceChange1h,
      metrics?.priceChange1h,
      price?.change1h,
      change?.h1,
      change?.hour
    ) ?? 0;
  const priceChange24h =
    firstNumber(
      record.priceChange24h,
      record.price_change_24h,
      stats?.priceChange24h,
      marketStats?.priceChange24h,
      metrics?.priceChange24h,
      price?.change24h,
      change?.h24,
      change?.day
    ) ?? 0;
  const holders =
    firstNumber(
      record.holders,
      record.holderCount,
      record.uniqueHolders,
      stats?.holders,
      stats?.holderCount,
      marketStats?.holderCount,
      metrics?.holders
    ) ?? 0;
  const tradingFees24h =
    firstNumber(
      record.tradingFees24h,
      record.fees24h,
      record.creatorFees24h,
      stats?.tradingFees24h,
      stats?.creatorFees24h,
      stats?.fees24h,
      marketStats?.tradingFees24h,
      metrics?.tradingFees24h
    ) ?? 0;

  if (!address || !name || !symbol || volume24h === null) {
    return null;
  }

  return {
    address,
    name,
    symbol: symbol.toUpperCase(),
    volume24h: round(volume24h, 2),
    priceChange1h: round(priceChange1h, 2),
    priceChange24h: round(priceChange24h, 2),
    holders: Math.max(0, Math.floor(holders)),
    tradingFees24h: round(Math.max(0, tradingFees24h), 2),
  };
}

function collectCandidateNodes(value: unknown, depth: number, output: unknown[]): void {
  if (depth > 5 || value === null || value === undefined) return;

  if (Array.isArray(value)) {
    for (const item of value) {
      collectCandidateNodes(item, depth + 1, output);
    }
    return;
  }

  const record = toRecord(value);
  if (!record) return;

  if (
    record.address !== undefined ||
    record.coinAddress !== undefined ||
    record.contractAddress !== undefined ||
    record.tokenAddress !== undefined ||
    record.coin !== undefined
  ) {
    output.push(record);
  }

  const nestedKeys = [
    'data',
    'result',
    'results',
    'coins',
    'trendingCoins',
    'trending',
    'items',
    'explore',
    'exploreList',
    'edges',
    'node',
    'coin',
  ] as const;

  for (const key of nestedKeys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      collectCandidateNodes(record[key], depth + 1, output);
    }
  }
}

function extractCoinsFromPayload(payload: unknown): ZoraTrendingCoin[] {
  const candidates: unknown[] = [];
  collectCandidateNodes(payload, 0, candidates);

  const seen = new Set<string>();
  const parsed: ZoraTrendingCoin[] = [];

  for (const candidate of candidates) {
    const coin = parseTrendingCoin(candidate);
    if (!coin) continue;
    const key = coin.address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    parsed.push(coin);
  }

  return parsed;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchFromZoraGraphQL(limit: number): Promise<ZoraLiveFetchResult | null> {
  const query = `
    query BotIndexExploreTopVolume($count: Int!) {
      exploreList(listType: TOP_VOLUME_24H, count: $count) {
        edges {
          node {
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
      }
    }
  `;

  try {
    const response = await fetchWithTimeout(ZORA_GRAPHQL_API_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables: { count: limit } }),
    });

    if (!response.ok) {
      logger.warn({ status: response.status }, 'Zora GraphQL trending query failed');
      return null;
    }

    const payload = (await response.json()) as unknown;
    const payloadRecord = toRecord(payload);
    if (payloadRecord && Array.isArray(payloadRecord.errors) && payloadRecord.errors.length > 0) {
      logger.warn({ errors: payloadRecord.errors }, 'Zora GraphQL returned errors for trending query');
      return null;
    }

    const coins = extractCoinsFromPayload(payload).slice(0, limit);
    if (coins.length === 0) {
      logger.warn('Zora GraphQL trending query returned no parsable coins');
      return null;
    }

    return { coins, provider: 'zora_graphql' };
  } catch (error) {
    logger.warn({ err: error }, 'Zora GraphQL unreachable for trending query');
    return null;
  }
}

async function fetchFromZoraRestExplore(limit: number): Promise<ZoraLiveFetchResult | null> {
  for (const baseUrl of ZORA_REST_EXPLORE_URLS) {
    const url = new URL(baseUrl);
    url.searchParams.set('listType', 'TOP_VOLUME_24H');
    url.searchParams.set('count', String(limit));
    url.searchParams.set('limit', String(limit));

    try {
      const response = await fetchWithTimeout(url.toString(), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        logger.warn({ status: response.status, url: baseUrl }, 'Zora REST explore query failed');
        continue;
      }

      const payload = (await response.json()) as unknown;
      const coins = extractCoinsFromPayload(payload).slice(0, limit);

      if (coins.length === 0) {
        logger.warn({ url: baseUrl }, 'Zora REST explore returned no parsable coins');
        continue;
      }

      return { coins, provider: 'zora_rest' };
    } catch (error) {
      logger.warn({ err: error, url: baseUrl }, 'Zora REST explore endpoint unreachable');
    }
  }

  return null;
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

async function fetchLiveTrendingCoins(limit: number): Promise<ZoraLiveFetchResult | null> {
  const graphqlResult = await fetchFromZoraGraphQL(limit);
  if (graphqlResult) return graphqlResult;

  const restResult = await fetchFromZoraRestExplore(limit);
  if (restResult) return restResult;

  return null;
}

export async function getZoraTrendingCoins(limit: number): Promise<ZoraTrendingCoinsResponse> {
  const normalizedLimit = normalizeLimit(limit);
  const now = Date.now();
  const cached = trendingCache.get(normalizedLimit);

  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const liveResult = await fetchLiveTrendingCoins(normalizedLimit);
  const data: ZoraTrendingCoinsResponse = liveResult
    ? {
        coins: liveResult.coins,
        source: 'live',
        provider: liveResult.provider,
      }
    : {
        coins: getMockTrendingCoins(normalizedLimit),
        source: 'mock',
        provider: 'mock_seed',
      };

  if (data.source === 'mock') {
    logger.warn('Using mock Zora trending coins as last-resort fallback');
  } else {
    logger.info(
      { provider: data.provider, count: data.coins.length },
      'Fetched live Zora trending coins'
    );
  }

  trendingCache.set(normalizedLimit, {
    data,
    expiresAt: now + CACHE_TTL_MS,
  });

  return data;
}

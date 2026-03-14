import logger from '../../../config/logger';

export type PolymarketFomcMarket = {
  question: string;
  outcomePrices: number[];
  volume24hr: number;
  liquidity: number;
  endDate: string;
  slug: string;
};

export type PolymarketMicroMarket = {
  question: string;
  outcomes: string[];
  outcomePrices: number[];
  volume24hr: number;
  endDate: string;
  slug: string;
  eventSlug: string;
  icon: string;
};

export type PolymarketWhaleTrade = {
  title: string;
  outcome: string;
  side: string;
  size: number;
  price: number;
  notional: number;
  timestamp: string;
  proxyWallet: string;
  slug: string;
  transactionHash: string;
};

const GAMMA_ACTIVE_MARKETS_URL = 'https://gamma-api.polymarket.com/markets?limit=100&active=true&closed=false';
const GAMMA_MICRO_MARKETS_URL =
  'https://gamma-api.polymarket.com/markets?limit=100&active=true&closed=false&order=volume24hr&ascending=false';
const DATA_API_TRADES_URL = 'https://data-api.polymarket.com/trades?limit=100';

const REQUEST_TIMEOUT_MS = 5_000;
const FOMC_CACHE_TTL_MS = 5 * 60 * 1000;

let fomcCache: { data: PolymarketFomcMarket[]; expiresAt: number } | null = null;

type ParsedTrade = PolymarketWhaleTrade & { timestampMs: number };

function toRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null) return null;
  return value as Record<string, unknown>;
}

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return 0;
}

function toStringValue(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function parseStringArray(raw: unknown): string[] {
  const parsed = parseMaybeJsonArray(raw);
  return parsed.map((item) => toStringValue(item)).filter((item) => item.length > 0);
}

function parseNumberArray(raw: unknown): number[] {
  const parsed = parseMaybeJsonArray(raw);
  return parsed.map((item) => toNumber(item)).filter((item) => Number.isFinite(item));
}

function parseMaybeJsonArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;

  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return [];
    }
  }

  return [];
}

function parseTimestampMs(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw > 1_000_000_000_000 ? raw : raw * 1000;
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return null;

    const numeric = Number.parseFloat(trimmed);
    if (Number.isFinite(numeric)) {
      return numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
    }

    const parsed = Date.parse(trimmed);
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
}

function toIsoTimestamp(raw: unknown): string {
  const timestampMs = parseTimestampMs(raw);
  if (timestampMs === null) return '';

  try {
    return new Date(timestampMs).toISOString();
  } catch {
    return '';
  }
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Polymarket API returned ${response.status}`);
    }

    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchGammaMarkets(url: string): Promise<Record<string, unknown>[]> {
  const payload = await fetchJson(url);

  if (!Array.isArray(payload)) {
    throw new Error('Unexpected Polymarket Gamma response shape');
  }

  return payload.map((item) => toRecord(item)).filter((item): item is Record<string, unknown> => item !== null);
}

function normalizeQuestion(record: Record<string, unknown>): string {
  const question = toStringValue(record.question);
  if (question.length > 0) return question;
  return toStringValue(record.title);
}

function parseMarketBase(record: Record<string, unknown>) {
  const question = normalizeQuestion(record);
  const outcomePrices = parseNumberArray(record.outcomePrices);
  const volume24hr = toNumber(record.volume24hr);
  const liquidity = toNumber(record.liquidity);
  const endDate = toStringValue(record.endDate);
  const slug = toStringValue(record.slug);

  if (!question || !endDate || !slug) return null;

  return {
    question,
    outcomePrices,
    volume24hr,
    liquidity,
    endDate,
    slug,
  };
}

function isFomcQuestion(question: string): boolean {
  const lower = question.toLowerCase();
  return lower.includes('fed') || lower.includes('fomc') || lower.includes('interest rate');
}

function isEndingWithinTwoHours(endDate: string): boolean {
  const endTimestamp = Date.parse(endDate);
  if (!Number.isFinite(endTimestamp)) return false;

  const now = Date.now();
  const twoHoursFromNow = now + 2 * 60 * 60 * 1000;
  return endTimestamp >= now && endTimestamp <= twoHoursFromNow;
}

function parseMicroMarket(record: Record<string, unknown>): PolymarketMicroMarket | null {
  const base = parseMarketBase(record);
  if (!base) return null;

  const outcomes = parseStringArray(record.outcomes);
  const eventSlug = toStringValue(record.eventSlug);
  const icon = toStringValue(record.icon);

  return {
    question: base.question,
    outcomes,
    outcomePrices: base.outcomePrices,
    volume24hr: base.volume24hr,
    endDate: base.endDate,
    slug: base.slug,
    eventSlug,
    icon,
  };
}

function parseWhaleTrade(record: Record<string, unknown>): ParsedTrade | null {
  const size = toNumber(record.size ?? record.amount ?? record.sz);
  const price = toNumber(record.price ?? record.px);
  const notional = size * price;

  if (notional <= 10_000) return null;

  const timestampMs = parseTimestampMs(record.timestamp ?? record.time ?? record.createdAt ?? record.created_at);
  if (timestampMs === null) return null;

  const title = toStringValue(record.title ?? record.question);
  const outcome = toStringValue(record.outcome ?? record.outcomeName ?? record.tokenName);
  const sideRaw = toStringValue(record.side ?? record.taker_side ?? record.maker_side);
  const side = sideRaw ? sideRaw.toUpperCase() : '';
  const proxyWallet = toStringValue(record.proxyWallet ?? record.proxy_wallet ?? record.wallet ?? record.user);
  const slug = toStringValue(record.slug ?? record.marketSlug ?? record.market_slug);
  const transactionHash = toStringValue(record.transactionHash ?? record.transaction_hash ?? record.hash);

  return {
    title,
    outcome,
    side,
    size,
    price,
    notional,
    timestamp: toIsoTimestamp(timestampMs),
    proxyWallet,
    slug,
    transactionHash,
    timestampMs,
  };
}

export async function getPolymarketFomcMarkets(): Promise<PolymarketFomcMarket[]> {
  const now = Date.now();

  if (fomcCache && fomcCache.expiresAt > now) {
    return fomcCache.data;
  }

  try {
    const markets = await fetchGammaMarkets(GAMMA_ACTIVE_MARKETS_URL);

    const fomcMarkets = markets
      .map((record) => parseMarketBase(record))
      .filter((market): market is PolymarketFomcMarket => market !== null)
      .filter((market) => isFomcQuestion(market.question))
      .sort((a, b) => b.volume24hr - a.volume24hr);

    fomcCache = {
      data: fomcMarkets,
      expiresAt: now + FOMC_CACHE_TTL_MS,
    };

    return fomcMarkets;
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch Polymarket FOMC markets');

    if (fomcCache) {
      return fomcCache.data;
    }

    throw error;
  }
}

export async function getPolymarketMicroMarkets(): Promise<PolymarketMicroMarket[]> {
  const markets = await fetchGammaMarkets(GAMMA_MICRO_MARKETS_URL);

  return markets
    .map((record) => parseMicroMarket(record))
    .filter((market): market is PolymarketMicroMarket => market !== null)
    .filter((market) => market.question.toLowerCase().includes('up or down'))
    .filter((market) => isEndingWithinTwoHours(market.endDate));
}

export async function getPolymarketMicroMarketsTop(limit: number = 3): Promise<PolymarketMicroMarket[]> {
  const markets = await getPolymarketMicroMarkets();
  return markets.slice(0, Math.max(0, limit));
}

export async function getPolymarketWhaleTrades(): Promise<PolymarketWhaleTrade[]> {
  const payload = await fetchJson(DATA_API_TRADES_URL);

  if (!Array.isArray(payload)) {
    throw new Error('Unexpected Polymarket data-api trades response shape');
  }

  return payload
    .map((item) => toRecord(item))
    .filter((item): item is Record<string, unknown> => item !== null)
    .map((record) => parseWhaleTrade(record))
    .filter((trade): trade is ParsedTrade => trade !== null)
    .sort((a, b) => b.timestampMs - a.timestampMs)
    .map(({ timestampMs: _timestampMs, ...trade }) => trade);
}

export async function getPolymarketWhaleTradesLatest(limit: number = 5): Promise<PolymarketWhaleTrade[]> {
  const trades = await getPolymarketWhaleTrades();
  return trades.slice(0, Math.max(0, limit));
}

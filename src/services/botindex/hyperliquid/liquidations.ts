import logger from '../../../config/logger';

export type LiquidationHeatmapRow = {
  symbol: string;
  priceLevel: number;
  longLiquidations: number;
  shortLiquidations: number;
  totalNotional: number;
};

export type LiquidationHeatmapResponse = {
  heatmap: LiquidationHeatmapRow[];
};

const HL_INFO_URL = 'https://api.hyperliquid.xyz/info';
const CACHE_TTL_MS = 5 * 60 * 1000;

const liquidationCache = new Map<string, { data: LiquidationHeatmapResponse; expiresAt: number }>();

const LEVEL_OFFSETS = [-0.08, -0.05, -0.03, -0.02, -0.01, 0.01, 0.02, 0.03, 0.05, 0.08];

type MarketContext = {
  symbol: string;
  markPrice: number;
  openInterest: number;
  dayNotionalVolume: number;
};

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
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  return null;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

async function postHyperliquidInfo(body: Record<string, unknown>): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(HL_INFO_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Hyperliquid API returned ${response.status}`);
    }

    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchMarketContexts(): Promise<MarketContext[]> {
  const payload = await postHyperliquidInfo({ type: 'metaAndAssetCtxs' });
  if (!Array.isArray(payload) || payload.length < 2) {
    throw new Error('Unexpected Hyperliquid metaAndAssetCtxs response');
  }

  const meta = toRecord(payload[0]);
  const contexts = Array.isArray(payload[1]) ? payload[1] : [];
  const universe = meta && Array.isArray(meta.universe) ? meta.universe : [];

  const results: MarketContext[] = [];
  const length = Math.min(universe.length, contexts.length);

  for (let index = 0; index < length; index += 1) {
    const universeItem = toRecord(universe[index]);
    const ctxItem = toRecord(contexts[index]);
    if (!universeItem || !ctxItem) continue;

    const symbol = toStringValue(universeItem.name ?? universeItem.coin ?? universeItem.symbol);
    const markPrice = toNumber(ctxItem.markPx ?? ctxItem.oraclePx);
    const openInterest = toNumber(ctxItem.openInterest);
    const dayNotionalVolume = toNumber(ctxItem.dayNtlVlm ?? ctxItem.dayVolume) ?? 0;

    if (!symbol || markPrice === null || openInterest === null) continue;
    if (markPrice <= 0 || openInterest <= 0) continue;

    results.push({
      symbol: symbol.toUpperCase(),
      markPrice,
      openInterest,
      dayNotionalVolume,
    });
  }

  return results;
}

function estimateHeatmapRows(market: MarketContext): LiquidationHeatmapRow[] {
  const markNotional = market.markPrice * market.openInterest;
  const flowFactor =
    markNotional > 0
      ? clamp(market.dayNotionalVolume / markNotional, 0.65, 1.45)
      : 1;

  // TODO: Replace this modeled heatmap with a direct aggregated clearinghouse liquidation feed when available.
  return LEVEL_OFFSETS.map((offset) => {
    const priceLevel = market.markPrice * (1 + offset);
    const proximityWeight = 1 / (Math.abs(offset) * 100 + 0.35);
    const bandNotional = markNotional * 0.035 * proximityWeight * flowFactor;

    const longSkew = offset < 0 ? 0.75 : 0.25;
    const shortSkew = 1 - longSkew;
    const longLiquidations = bandNotional * longSkew;
    const shortLiquidations = bandNotional * shortSkew;

    return {
      symbol: market.symbol,
      priceLevel: round(priceLevel, 6),
      longLiquidations: round(longLiquidations, 2),
      shortLiquidations: round(shortLiquidations, 2),
      totalNotional: round(longLiquidations + shortLiquidations, 2),
    };
  });
}

export async function getLiquidationHeatmap(): Promise<LiquidationHeatmapResponse> {
  const cacheKey = 'hl-liquidation-heatmap';
  const now = Date.now();
  const cached = liquidationCache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  try {
    const markets = await fetchMarketContexts();
    const topMarkets = markets
      .sort((a, b) => b.openInterest - a.openInterest)
      .slice(0, 10);

    const heatmap = topMarkets.flatMap((market) => estimateHeatmapRows(market));
    const data: LiquidationHeatmapResponse = { heatmap };

    liquidationCache.set(cacheKey, { data, expiresAt: now + CACHE_TTL_MS });
    return data;
  } catch (error) {
    logger.error({ err: error }, 'Failed to build Hyperliquid liquidation heatmap');
    throw error;
  }
}

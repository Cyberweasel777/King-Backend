import logger from '../../../config/logger';

export type HLCorrelationMatrixResponse = {
  matrix: Record<string, Record<string, number>>;
  timestamp: string;
};

const HL_INFO_URL = 'https://api.hyperliquid.xyz/info';
const CACHE_TTL_MS = 5 * 60 * 1000;
const CANDLE_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const CORRELATION_COINS = ['BTC', 'ETH', 'SOL', 'DOGE', 'XRP', 'AVAX', 'LINK', 'ARB', 'OP', 'SUI'] as const;

const correlationCache = new Map<string, { data: HLCorrelationMatrixResponse; expiresAt: number }>();

type CandlePoint = {
  timestamp: number;
  close: number;
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

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
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

function parseCandles(payload: unknown): CandlePoint[] {
  const directCandles = Array.isArray(payload)
    ? payload
    : Array.isArray(toRecord(payload)?.candles)
      ? (toRecord(payload)?.candles as unknown[])
      : [];

  const out: CandlePoint[] = [];
  for (const candle of directCandles) {
    const record = toRecord(candle);
    if (!record) continue;

    const timestamp = toNumber(record.t ?? record.T ?? record.timestamp ?? record.time);
    const close = toNumber(record.c ?? record.close);
    if (timestamp === null || close === null) continue;

    out.push({ timestamp, close });
  }

  out.sort((a, b) => a.timestamp - b.timestamp);

  const dedupedByTimestamp = new Map<number, CandlePoint>();
  for (const row of out) {
    dedupedByTimestamp.set(row.timestamp, row);
  }

  return Array.from(dedupedByTimestamp.values()).sort((a, b) => a.timestamp - b.timestamp);
}

async function fetchHourlyCloseSeries(symbol: string): Promise<CandlePoint[]> {
  const endTime = Date.now();
  const startTime = endTime - CANDLE_LOOKBACK_MS;

  const payload = await postHyperliquidInfo({
    type: 'candleSnapshot',
    req: {
      coin: symbol,
      interval: '1h',
      startTime,
      endTime,
    },
  });

  return parseCandles(payload);
}

function buildCloseMap(series: CandlePoint[]): Map<number, number> {
  const closes = new Map<number, number>();
  for (const point of series) {
    if (!Number.isFinite(point.close)) continue;
    closes.set(point.timestamp, point.close);
  }
  return closes;
}

function alignCloseSeries(
  left: Map<number, number>,
  right: Map<number, number>
): { leftSeries: number[]; rightSeries: number[] } {
  const timestamps: number[] = [];

  for (const timestamp of left.keys()) {
    if (right.has(timestamp)) timestamps.push(timestamp);
  }

  timestamps.sort((a, b) => a - b);

  const leftSeries: number[] = [];
  const rightSeries: number[] = [];

  for (const timestamp of timestamps) {
    const leftValue = left.get(timestamp);
    const rightValue = right.get(timestamp);
    if (leftValue === undefined || rightValue === undefined) continue;
    leftSeries.push(leftValue);
    rightSeries.push(rightValue);
  }

  return { leftSeries, rightSeries };
}

function pearson(left: number[], right: number[]): number {
  if (left.length !== right.length || left.length < 2) return 0;

  const n = left.length;
  const sumLeft = left.reduce((sum, value) => sum + value, 0);
  const sumRight = right.reduce((sum, value) => sum + value, 0);
  const sumLeftSq = left.reduce((sum, value) => sum + value * value, 0);
  const sumRightSq = right.reduce((sum, value) => sum + value * value, 0);
  const sumCross = left.reduce((sum, value, index) => sum + value * right[index], 0);

  const numerator = n * sumCross - sumLeft * sumRight;
  const denominator = Math.sqrt((n * sumLeftSq - sumLeft ** 2) * (n * sumRightSq - sumRight ** 2));

  if (denominator === 0) return 0;
  return Math.max(-1, Math.min(1, numerator / denominator));
}

export async function getHLCorrelationMatrix(): Promise<HLCorrelationMatrixResponse> {
  const cacheKey = 'hl-correlation-matrix';
  const now = Date.now();
  const cached = correlationCache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  try {
    const symbols = [...CORRELATION_COINS];
    if (symbols.length === 0) {
      const empty: HLCorrelationMatrixResponse = {
        matrix: {},
        timestamp: new Date().toISOString(),
      };
      correlationCache.set(cacheKey, { data: empty, expiresAt: now + CACHE_TTL_MS });
      return empty;
    }

    const seriesEntries = await Promise.all(
      symbols.map(async (symbol) => {
        try {
          const series = await fetchHourlyCloseSeries(symbol);
          return { symbol, series };
        } catch (error) {
          logger.warn({ err: error, symbol }, 'Failed to fetch Hyperliquid candles for symbol');
          return { symbol, series: [] as CandlePoint[] };
        }
      })
    );

    const closesBySymbol = new Map<string, Map<number, number>>();
    for (const entry of seriesEntries) {
      if (entry.series.length < 12) continue;
      const closes = buildCloseMap(entry.series);
      if (closes.size < 24) continue;
      closesBySymbol.set(entry.symbol, closes);
    }

    const usableSymbols = Array.from(closesBySymbol.keys());
    const matrix: Record<string, Record<string, number>> = {};

    for (const symbol of usableSymbols) {
      matrix[symbol] = {};
    }

    for (let i = 0; i < usableSymbols.length; i += 1) {
      const leftSymbol = usableSymbols[i];
      matrix[leftSymbol][leftSymbol] = 1;

      for (let j = i + 1; j < usableSymbols.length; j += 1) {
        const rightSymbol = usableSymbols[j];
        const leftCloses = closesBySymbol.get(leftSymbol);
        const rightCloses = closesBySymbol.get(rightSymbol);
        if (!leftCloses || !rightCloses) continue;

        const aligned = alignCloseSeries(leftCloses, rightCloses);
        const correlation =
          aligned.leftSeries.length >= 24
            ? round(pearson(aligned.leftSeries, aligned.rightSeries), 4)
            : 0;

        matrix[leftSymbol][rightSymbol] = correlation;
        matrix[rightSymbol][leftSymbol] = correlation;
      }
    }

    const data: HLCorrelationMatrixResponse = {
      matrix,
      timestamp: new Date().toISOString(),
    };

    correlationCache.set(cacheKey, { data, expiresAt: now + CACHE_TTL_MS });
    return data;
  } catch (error) {
    logger.error({ err: error }, 'Failed to build Hyperliquid correlation matrix');
    throw error;
  }
}

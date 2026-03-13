import logger from '../../../config/logger';
import { getAttentionMomentum } from '../zora/attention';
import { getZoraTrendingCoins } from '../zora/trending';

export type MemeVelocityChain = 'base' | 'solana' | 'ethereum';
export type MemeVelocityPlatform = 'dexscreener' | 'zora' | 'pumpfun';

export interface MemeVelocitySignal {
  token: string;
  symbol: string;
  address: string;
  chain: MemeVelocityChain;
  platform: MemeVelocityPlatform;
  priceUsd: number;
  volume24h: number;
  volumeChange1h: number;
  marketCap: number;
  holders: number;
  velocityScore: number;
  signal: 'SURGE' | 'RISING' | 'STABLE' | 'FADING';
  detectedAt: string;
  url: string;
}

export type MemeVelocitySourceStatus = 'ok' | 'error';

export interface MemeVelocityScanResult {
  tokens: MemeVelocitySignal[];
  fetchedAt: string;
  cached: boolean;
  sources: Record<MemeVelocityPlatform, MemeVelocitySourceStatus>;
}

interface DexBoostRow {
  chainId?: string;
  tokenAddress?: string;
}

interface DexPair {
  chainId?: string;
  url?: string;
  baseToken?: {
    address?: string;
    name?: string;
    symbol?: string;
  };
  priceUsd?: string | number;
  volume?: {
    h24?: number;
    h1?: number;
  };
  marketCap?: number;
  fdv?: number;
}

interface DexTrendingResponse {
  pairs?: DexPair[];
}

const DEX_BOOSTS_URL = 'https://api.dexscreener.com/token-boosts/latest/v1';
const DEX_TRENDING_URL = 'https://api.dexscreener.com/latest/dex/search?q=trending';
const PUMPFUN_FEATURED_URL = 'https://frontend-api-v2.pump.fun/coins/featured';
const PUMPFUN_LIVE_URL = 'https://frontend-api-v2.pump.fun/coins/currently-live';

const CACHE_TTL_MS = 2 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10000;

let velocityCache: { data: MemeVelocityScanResult; expiresAt: number } | null = null;

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function toInteger(value: unknown): number {
  const parsed = Math.floor(toNumber(value));
  return parsed > 0 ? parsed : 0;
}

function normalizeChain(raw: unknown): MemeVelocityChain | null {
  const value = String(raw || '').toLowerCase().trim();
  if (!value) return null;
  if (value === 'base' || value === '8453') return 'base';
  if (value === 'solana' || value === 'sol') return 'solana';
  if (value === 'ethereum' || value === 'eth' || value === '1') return 'ethereum';
  return null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, decimals: number = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function estimateVolumeChange1h(volume1h: number, volume24h: number): number {
  if (!Number.isFinite(volume1h) || !Number.isFinite(volume24h) || volume24h <= 0) return 0;
  if (volume1h <= 0) return -100;

  const prior23h = Math.max(volume24h - volume1h, 0);
  if (prior23h <= 0) {
    return 400;
  }

  const priorHourlyAvg = prior23h / 23;
  if (priorHourlyAvg <= 0) {
    return 400;
  }

  const pct = ((volume1h - priorHourlyAvg) / priorHourlyAvg) * 100;
  return clamp(round(pct, 2), -100, 2000);
}

function calculateVelocityScore(params: {
  volumeChange1h: number;
  marketCap: number;
  holders: number;
  boosted?: boolean;
}): number {
  let score = 0;

  if (params.volumeChange1h > 200) {
    score += 40;
  } else if (params.volumeChange1h > 100) {
    score += 25;
  } else if (params.volumeChange1h > 50) {
    score += 15;
  }

  if (params.marketCap > 0 && params.marketCap < 1_000_000) {
    score += 20;
  } else if (params.marketCap >= 1_000_000 && params.marketCap <= 10_000_000) {
    score += 10;
  }

  if (params.holders > 1000) {
    score += 20;
  } else if (params.holders > 100) {
    score += 10;
  }

  if (params.boosted) {
    score += 10;
  }

  return clamp(Math.round(score), 0, 100);
}

function classifySignal(score: number): MemeVelocitySignal['signal'] {
  if (score >= 70) return 'SURGE';
  if (score >= 50) return 'RISING';
  if (score >= 30) return 'STABLE';
  return 'FADING';
}

async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'king-backend/1.0',
        ...(init.headers || {}),
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json() as T;
  } finally {
    clearTimeout(timeout);
  }
}

function dedupeSignals(signals: MemeVelocitySignal[]): MemeVelocitySignal[] {
  const map = new Map<string, MemeVelocitySignal>();

  for (const row of signals) {
    const key = `${row.platform}:${row.chain}:${row.address.toLowerCase()}`;
    const existing = map.get(key);
    if (!existing || row.velocityScore > existing.velocityScore) {
      map.set(key, row);
    }
  }

  return Array.from(map.values());
}

async function fetchDexScreenerSignals(): Promise<MemeVelocitySignal[]> {
  const [boostsRaw, trendingRaw] = await Promise.all([
    fetchJson<DexBoostRow[]>(DEX_BOOSTS_URL),
    fetchJson<DexTrendingResponse>(DEX_TRENDING_URL),
  ]);

  const boostedSet = new Set<string>();
  if (Array.isArray(boostsRaw)) {
    for (const boost of boostsRaw) {
      const chain = normalizeChain(boost.chainId);
      const address = String(boost.tokenAddress || '').trim();
      if (!chain || !address) continue;
      boostedSet.add(`${chain}:${address.toLowerCase()}`);
    }
  }

  const pairs = Array.isArray(trendingRaw?.pairs) ? trendingRaw.pairs : [];
  const nowIso = new Date().toISOString();

  const out: MemeVelocitySignal[] = [];
  for (const pair of pairs) {
    const chain = normalizeChain(pair.chainId);
    const address = String(pair.baseToken?.address || '').trim();
    if (!chain || !address) continue;

    const volume24h = toNumber(pair.volume?.h24);
    const volume1h = toNumber(pair.volume?.h1);
    const volumeChange1h = estimateVolumeChange1h(volume1h, volume24h);
    const marketCap = toNumber(pair.marketCap) || toNumber(pair.fdv);
    const holders = 0;
    const boosted = boostedSet.has(`${chain}:${address.toLowerCase()}`);
    const velocityScore = calculateVelocityScore({
      volumeChange1h,
      marketCap,
      holders,
      boosted,
    });

    out.push({
      token: String(pair.baseToken?.name || pair.baseToken?.symbol || 'Unknown Token'),
      symbol: String(pair.baseToken?.symbol || '').toUpperCase(),
      address,
      chain,
      platform: 'dexscreener',
      priceUsd: round(toNumber(pair.priceUsd), 10),
      volume24h: round(volume24h, 2),
      volumeChange1h,
      marketCap: round(marketCap, 2),
      holders,
      velocityScore,
      signal: classifySignal(velocityScore),
      detectedAt: nowIso,
      url: String(pair.url || `https://dexscreener.com/${chain}/${address}`),
    });
  }

  return dedupeSignals(out);
}

async function fetchZoraSignals(): Promise<MemeVelocitySignal[]> {
  const [trending, momentum] = await Promise.all([
    getZoraTrendingCoins(40),
    getAttentionMomentum(40),
  ]);

  const momentumByAddress = new Map<string, number>();
  for (const row of momentum.trends) {
    momentumByAddress.set(row.coinAddress.toLowerCase(), row.marketCapDelta24h);
  }

  const nowIso = new Date().toISOString();
  const out: MemeVelocitySignal[] = [];

  for (const coin of trending.coins) {
    const chain = normalizeChain(String(coin.chainId));
    if (!chain) continue;

    const address = String(coin.address || '').trim();
    if (!address) continue;

    const marketCap = toNumber(coin.marketCap);
    const delta24h = momentumByAddress.get(address.toLowerCase()) ?? toNumber(coin.marketCapDelta24h);

    // Zora does not expose native 1h volume change on this endpoint.
    // We use market cap delta as a short-horizon momentum proxy.
    const volumeChange1h = marketCap > 0
      ? clamp(round((delta24h / marketCap) * 100, 2), -100, 2000)
      : 0;

    const holders = toInteger(coin.uniqueHolders);
    const velocityScore = calculateVelocityScore({
      volumeChange1h,
      marketCap,
      holders,
      boosted: false,
    });

    out.push({
      token: coin.name,
      symbol: coin.symbol,
      address,
      chain,
      platform: 'zora',
      priceUsd: 0,
      volume24h: round(toNumber(coin.volume24h), 2),
      volumeChange1h,
      marketCap: round(marketCap, 2),
      holders,
      velocityScore,
      signal: classifySignal(velocityScore),
      detectedAt: nowIso,
      url: `https://zora.co/coin/${address}`,
    });
  }

  return dedupeSignals(out);
}

function getPumpRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null);
  }

  if (payload && typeof payload === 'object') {
    const root = payload as Record<string, unknown>;
    const nested = root.coins || root.data;
    if (Array.isArray(nested)) {
      return nested.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null);
    }
  }

  return [];
}

function parsePumpCoin(row: Record<string, unknown>, detectedAt: string): MemeVelocitySignal | null {
  const address = String(row.mint || row.mintAddress || row.tokenAddress || row.address || '').trim();
  if (!address) return null;

  const chain = normalizeChain(row.chain || row.chainId) || 'solana';

  const volumeObject = row.volume && typeof row.volume === 'object'
    ? row.volume as Record<string, unknown>
    : undefined;

  const symbol = String(row.symbol || '').toUpperCase();
  const token = String(row.name || symbol || 'Pump.fun Token');
  const priceUsd = toNumber(row.usd_price ?? row.priceUsd ?? row.price);
  const volume24h = toNumber(row.volume_24h ?? row.volume24h ?? volumeObject?.h24);
  const volume1h = toNumber(row.volume_1h ?? row.volume1h ?? volumeObject?.h1);
  const marketCap = toNumber(row.usd_market_cap ?? row.marketCap ?? row.market_cap);
  const holders = toInteger(row.holder_count ?? row.holders ?? row.unique_holders);
  const volumeChange1h = estimateVolumeChange1h(volume1h, volume24h);

  const velocityScore = calculateVelocityScore({
    volumeChange1h,
    marketCap,
    holders,
    boosted: false,
  });

  return {
    token,
    symbol,
    address,
    chain,
    platform: 'pumpfun',
    priceUsd: round(priceUsd, 10),
    volume24h: round(volume24h, 2),
    volumeChange1h,
    marketCap: round(marketCap, 2),
    holders,
    velocityScore,
    signal: classifySignal(velocityScore),
    detectedAt,
    url: `https://pump.fun/coin/${address}`,
  };
}

async function fetchPumpfunSignals(): Promise<MemeVelocitySignal[]> {
  const [featuredResult, liveResult] = await Promise.allSettled([
    fetchJson<unknown>(PUMPFUN_FEATURED_URL),
    fetchJson<unknown>(PUMPFUN_LIVE_URL),
  ]);

  const nowIso = new Date().toISOString();
  const rows: Record<string, unknown>[] = [];

  if (featuredResult.status === 'fulfilled') {
    rows.push(...getPumpRows(featuredResult.value));
  }
  if (liveResult.status === 'fulfilled') {
    rows.push(...getPumpRows(liveResult.value));
  }

  const parsed: MemeVelocitySignal[] = [];
  for (const row of rows) {
    const signal = parsePumpCoin(row, nowIso);
    if (signal) parsed.push(signal);
  }

  return dedupeSignals(parsed);
}

export async function scanMemeTokenVelocity(): Promise<MemeVelocityScanResult> {
  const now = Date.now();
  if (velocityCache && velocityCache.expiresAt > now) {
    return {
      ...velocityCache.data,
      cached: true,
    };
  }

  const [dexResult, zoraResult, pumpResult] = await Promise.allSettled([
    fetchDexScreenerSignals(),
    fetchZoraSignals(),
    fetchPumpfunSignals(),
  ]);

  const statuses: Record<MemeVelocityPlatform, MemeVelocitySourceStatus> = {
    dexscreener: dexResult.status === 'fulfilled' ? 'ok' : 'error',
    zora: zoraResult.status === 'fulfilled' ? 'ok' : 'error',
    pumpfun: pumpResult.status === 'fulfilled' ? 'ok' : 'error',
  };

  if (dexResult.status === 'rejected') {
    logger.warn({ err: dexResult.reason }, '[meme.velocity] DexScreener source failed');
  }
  if (zoraResult.status === 'rejected') {
    logger.warn({ err: zoraResult.reason }, '[meme.velocity] Zora source failed');
  }
  if (pumpResult.status === 'rejected') {
    logger.warn({ err: pumpResult.reason }, '[meme.velocity] Pump.fun source failed');
  }

  const combined = dedupeSignals([
    ...(dexResult.status === 'fulfilled' ? dexResult.value : []),
    ...(zoraResult.status === 'fulfilled' ? zoraResult.value : []),
    ...(pumpResult.status === 'fulfilled' ? pumpResult.value : []),
  ]).sort((a, b) => b.velocityScore - a.velocityScore);

  const response: MemeVelocityScanResult = {
    tokens: combined,
    fetchedAt: new Date().toISOString(),
    cached: false,
    sources: statuses,
  };

  velocityCache = {
    data: response,
    expiresAt: now + CACHE_TTL_MS,
  };

  return response;
}

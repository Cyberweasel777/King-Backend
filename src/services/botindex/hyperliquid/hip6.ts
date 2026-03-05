import logger from '../../../config/logger';

type Dict = Record<string, unknown>;

export type Hip6LaunchCandidate = {
  symbol: string;
  markPrice: number;
  fundingRate: number;
  dayNotionalVolume: number;
  openInterest: number;
  launchReadinessScore: number;
  rationale: string[];
};

export type Hip6LaunchCandidatesResponse = {
  source: 'hyperliquid_metaAndAssetCtxs';
  generatedAt: string;
  methodology: string;
  candidates: Hip6LaunchCandidate[];
};

const HL_INFO_URL = 'https://api.hyperliquid.xyz/info';
const CACHE_TTL_MS = 60 * 1000;

let cache: { expiresAt: number; data: Hip6LaunchCandidatesResponse } | null = null;

function asRecord(value: unknown): Dict | null {
  if (typeof value !== 'object' || value === null) return null;
  return value as Dict;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

async function postHyperliquidInfo(body: Dict): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

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

function readinessScore(dayNtlVlm: number, oi: number, fundingAbs: number): number {
  const volumeScore = Math.min(100, Math.log10(Math.max(1, dayNtlVlm)) * 12);
  const oiScore = Math.min(100, Math.log10(Math.max(1, oi)) * 14);
  const imbalanceScore = Math.min(100, fundingAbs * 10000 * 2.5);

  return round(volumeScore * 0.45 + oiScore * 0.45 + imbalanceScore * 0.1, 2);
}

function getRationale(dayNtlVlm: number, oi: number, fundingRate: number): string[] {
  const out: string[] = [];
  if (dayNtlVlm >= 10_000_000) out.push('high_24h_notional_volume');
  if (oi >= 5_000_000) out.push('high_open_interest');
  if (Math.abs(fundingRate) >= 0.0002) out.push('elevated_funding_imbalance');
  if (out.length === 0) out.push('baseline_liquidity_signal');
  return out;
}

export async function getHip6LaunchCandidates(limit = 20): Promise<Hip6LaunchCandidatesResponse> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return {
      ...cache.data,
      candidates: cache.data.candidates.slice(0, limit),
    };
  }

  try {
    const payload = await postHyperliquidInfo({ type: 'metaAndAssetCtxs' });
    if (!Array.isArray(payload) || payload.length < 2) {
      throw new Error('Unexpected Hyperliquid metaAndAssetCtxs payload');
    }

    const meta = asRecord(payload[0]);
    const universe = meta && Array.isArray(meta.universe) ? meta.universe : [];
    const contexts = Array.isArray(payload[1]) ? payload[1] : [];

    const majors = new Set(['BTC', 'ETH', 'SOL']);
    const candidates: Hip6LaunchCandidate[] = [];

    const maxLen = Math.min(universe.length, contexts.length);
    for (let i = 0; i < maxLen; i += 1) {
      const u = asRecord(universe[i]);
      const c = asRecord(contexts[i]);
      if (!u || !c) continue;

      const symbol = asString(u.name ?? u.coin ?? u.symbol)?.toUpperCase();
      if (!symbol || majors.has(symbol)) continue;

      const dayNotionalVolume = asNumber(c.dayNtlVlm) ?? asNumber(c.dayNotionalVolume) ?? 0;
      const openInterest = asNumber(c.openInterest) ?? asNumber(c.oi) ?? 0;
      const fundingRate = asNumber(c.funding) ?? asNumber(c.fundingRate) ?? 0;
      const markPrice = asNumber(c.markPx) ?? asNumber(c.midPx) ?? 0;

      if (dayNotionalVolume <= 0 && openInterest <= 0) continue;

      candidates.push({
        symbol,
        markPrice: round(markPrice, 6),
        fundingRate: round(fundingRate, 8),
        dayNotionalVolume: round(dayNotionalVolume, 2),
        openInterest: round(openInterest, 2),
        launchReadinessScore: readinessScore(dayNotionalVolume, openInterest, Math.abs(fundingRate)),
        rationale: getRationale(dayNotionalVolume, openInterest, fundingRate),
      });
    }

    candidates.sort((a, b) => b.launchReadinessScore - a.launchReadinessScore);

    const data: Hip6LaunchCandidatesResponse = {
      source: 'hyperliquid_metaAndAssetCtxs',
      generatedAt: new Date().toISOString(),
      methodology:
        'Heuristic HIP-6 readiness ranking using Hyperliquid perp market structure (24h notional volume, open interest, funding imbalance). This is a signal layer, not an official HIP-6 auction feed.',
      candidates,
    };

    cache = { expiresAt: now + CACHE_TTL_MS, data };

    return {
      ...data,
      candidates: data.candidates.slice(0, limit),
    };
  } catch (error) {
    logger.error({ err: error }, 'Failed to compute HIP-6 launch candidates');
    throw error;
  }
}

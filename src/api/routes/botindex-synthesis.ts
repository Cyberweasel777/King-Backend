/**
 * BotIndex Synthesis Routes — Cross-source intelligence endpoints.
 *
 * These combine multiple free upstream APIs into scored signals
 * that no single source provides. Premium endpoints gated via softGate.
 */

import { Request, Response, Router } from 'express';
import { softGate } from '../middleware/softGate';
import logger from '../../config/logger';
import { getHyperliquidWhaleAlerts } from '../../services/botindex/hyperliquid/whale-alerts';
import { getFundingArbOpportunities } from '../../services/botindex/hyperliquid/funding-arb';

const router = Router();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const FETCH_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const smartMoneyCache: { entry: CacheEntry<unknown> | null } = { entry: null };
const riskRadarCache: { entry: CacheEntry<unknown> | null } = { entry: null };

function cloneJson<T>(data: T): T {
  return JSON.parse(JSON.stringify(data));
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<globalThis.Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function safeFetchJson<T>(url: string, label: string): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) {
      logger.warn({ url, status: res.status, label }, 'Synthesis source returned non-200');
      return { ok: false, error: `${label}: HTTP ${res.status}` };
    }
    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ url, err: msg, label }, 'Synthesis source fetch failed');
    return { ok: false, error: `${label}: ${msg}` };
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// ---------------------------------------------------------------------------
// Endpoint 1: GET /smart-money-flow
// ---------------------------------------------------------------------------

interface SmartMoneySignal {
  asset: string;
  signal_strength: number;
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: 'high' | 'medium' | 'low';
  sources: string[];
  evidence: string[];
}

interface SmartMoneyResponse {
  timestamp: string;
  signals: SmartMoneySignal[];
  metadata: { sources_queried: number; sources_ok: number; latency_ms: number; errors: string[] };
  market_summary: { dominant_flow: string; top_chain: string; top_token: string };
}

interface LlamaChain {
  name: string;
  tvl: number;
  tokenSymbol?: string;
  gecko_id?: string;
}

interface LlamaProtocol {
  name: string;
  tvl: number;
  change_1d?: number;
  change_7d?: number;
  chain?: string;
  chains?: string[];
  symbol?: string;
}

interface DexBoost {
  tokenAddress?: string;
  chainId?: string;
  amount?: number;
  description?: string;
  url?: string;
}

async function buildSmartMoneyFlow(): Promise<SmartMoneyResponse> {
  const start = Date.now();
  const errors: string[] = [];
  let sourcesOk = 0;

  // Parallel fetch all sources
  const [whaleResult, chainsResult, protocolsResult, boostsResult] = await Promise.all([
    getHyperliquidWhaleAlerts().then(d => ({ ok: true as const, data: d })).catch(e => {
      const msg = `whales: ${e instanceof Error ? e.message : String(e)}`;
      errors.push(msg);
      return { ok: false as const, error: msg };
    }),
    safeFetchJson<LlamaChain[]>('https://api.llama.fi/chains', 'defillama-chains'),
    safeFetchJson<LlamaProtocol[]>('https://api.llama.fi/protocols', 'defillama-protocols'),
    safeFetchJson<DexBoost[]>('https://api.dexscreener.com/token-boosts/top/v1', 'dexscreener-boosts'),
  ]);

  if (whaleResult.ok) sourcesOk++;
  if (chainsResult.ok) sourcesOk++;
  else errors.push(chainsResult.error);
  if (protocolsResult.ok) sourcesOk++;
  else errors.push(protocolsResult.error);
  if (boostsResult.ok) sourcesOk++;
  else errors.push(boostsResult.error);

  const signalMap = new Map<string, { scores: number[]; directions: string[]; sources: string[]; evidence: string[] }>();

  function touch(asset: string) {
    if (!signalMap.has(asset)) signalMap.set(asset, { scores: [], directions: [], sources: [], evidence: [] });
    return signalMap.get(asset)!;
  }

  // --- Whale signals ---
  if (whaleResult.ok) {
    const positions = whaleResult.data.topPositions || [];
    const coinCounts = new Map<string, { long: number; short: number; totalValue: number }>();
    for (const p of positions) {
      const c = coinCounts.get(p.coin) || { long: 0, short: 0, totalValue: 0 };
      if (p.side === 'LONG') c.long++;
      else c.short++;
      c.totalValue += p.positionValue;
      coinCounts.set(p.coin, c);
    }
    for (const [coin, c] of coinCounts) {
      const total = c.long + c.short;
      if (total === 0) continue;
      const dominance = Math.max(c.long, c.short) / total;
      const score = clamp(Math.round(dominance * 60 + Math.min(c.totalValue / 5_000_000, 1) * 40), 0, 100);
      const dir = c.long > c.short ? 'bullish' : c.short > c.long ? 'bearish' : 'neutral';
      const entry = touch(coin);
      entry.scores.push(score);
      entry.directions.push(dir);
      entry.sources.push('hyperliquid-whales');
      entry.evidence.push(`${total} whales, ${c.long}L/${c.short}S, $${(c.totalValue / 1e6).toFixed(1)}M total`);
    }
  }

  // --- DeFiLlama protocol movers ---
  if (protocolsResult.ok) {
    const protocols = protocolsResult.data
      .filter((p): p is LlamaProtocol & { change_1d: number } => typeof p.change_1d === 'number' && p.tvl > 1_000_000)
      .sort((a, b) => Math.abs(b.change_1d) - Math.abs(a.change_1d))
      .slice(0, 30);

    for (const p of protocols) {
      const asset = p.symbol || p.name;
      const score = clamp(Math.round(Math.abs(p.change_1d) * 2), 0, 100);
      const dir = p.change_1d > 5 ? 'bullish' : p.change_1d < -5 ? 'bearish' : 'neutral';
      const entry = touch(asset);
      entry.scores.push(score);
      entry.directions.push(dir);
      entry.sources.push('defillama');
      entry.evidence.push(`TVL $${(p.tvl / 1e9).toFixed(2)}B, 1d change ${p.change_1d > 0 ? '+' : ''}${p.change_1d.toFixed(1)}%`);
    }
  }

  // --- DexScreener boosts ---
  if (boostsResult.ok && Array.isArray(boostsResult.data)) {
    const boosts = boostsResult.data.slice(0, 20);
    for (const b of boosts) {
      const asset = b.description || b.tokenAddress || 'unknown';
      const score = clamp(Math.round(Math.min((b.amount || 0) / 500, 1) * 80), 0, 100);
      const entry = touch(asset);
      entry.scores.push(score);
      entry.directions.push('bullish'); // boosts are inherently bullish signal
      entry.sources.push('dexscreener');
      entry.evidence.push(`Boost amount: ${b.amount || 0}, chain: ${b.chainId || 'unknown'}`);
    }
  }

  // --- Aggregate signals ---
  const signals: SmartMoneySignal[] = [];
  for (const [asset, data] of signalMap) {
    const avgScore = Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length);
    const sourceCount = new Set(data.sources).size;

    // Direction: majority vote
    const dirCounts = { bullish: 0, bearish: 0, neutral: 0 };
    for (const d of data.directions) dirCounts[d as keyof typeof dirCounts]++;
    const direction: 'bullish' | 'bearish' | 'neutral' =
      dirCounts.bullish >= dirCounts.bearish && dirCounts.bullish >= dirCounts.neutral ? 'bullish' :
      dirCounts.bearish >= dirCounts.neutral ? 'bearish' : 'neutral';

    const confidence: 'high' | 'medium' | 'low' =
      sourceCount >= 3 ? 'high' : sourceCount === 2 ? 'medium' : 'low';

    // Boost score for multi-source convergence
    const convergenceBonus = (sourceCount - 1) * 10;
    const finalScore = clamp(avgScore + convergenceBonus, 0, 100);

    signals.push({
      asset,
      signal_strength: finalScore,
      direction,
      confidence,
      sources: [...new Set(data.sources)],
      evidence: data.evidence,
    });
  }

  signals.sort((a, b) => b.signal_strength - a.signal_strength);
  const top20 = signals.slice(0, 20);

  // Market summary
  const bullishCount = top20.filter(s => s.direction === 'bullish').length;
  const bearishCount = top20.filter(s => s.direction === 'bearish').length;
  const dominantFlow = bullishCount > bearishCount ? 'bullish' : bearishCount > bullishCount ? 'bearish' : 'neutral';

  // Top chain from DeFiLlama
  let topChain = 'unknown';
  if (chainsResult.ok) {
    const sorted = [...chainsResult.data].sort((a, b) => (b.tvl || 0) - (a.tvl || 0));
    topChain = sorted[0]?.name || 'unknown';
  }

  return {
    timestamp: new Date().toISOString(),
    signals: top20,
    metadata: { sources_queried: 4, sources_ok: sourcesOk, latency_ms: Date.now() - start, errors },
    market_summary: {
      dominant_flow: dominantFlow,
      top_chain: topChain,
      top_token: top20[0]?.asset || 'none',
    },
  };
}

router.get('/smart-money-flow', softGate(), async (_req: Request, res: Response) => {
  try {
    const now = Date.now();
    if (smartMoneyCache.entry && now < smartMoneyCache.entry.expiresAt) {
      res.json(cloneJson(smartMoneyCache.entry.data));
      return;
    }

    const data = await buildSmartMoneyFlow();
    smartMoneyCache.entry = { data, expiresAt: now + CACHE_TTL_MS };
    res.json(cloneJson(data));
  } catch (err) {
    logger.error({ err }, 'smart-money-flow endpoint failed');
    res.status(500).json({ error: 'smart_money_flow_failed', message: err instanceof Error ? err.message : 'Unknown error' });
  }
});

// ---------------------------------------------------------------------------
// Endpoint 2: GET /risk-radar
// ---------------------------------------------------------------------------

interface RiskComponent {
  score: number;
  detail: string;
}

interface RiskRadarResponse {
  timestamp: string;
  risk_score: number;
  risk_level: 'LOW' | 'MODERATE' | 'HIGH' | 'EXTREME';
  components: {
    funding_risk: RiskComponent;
    sentiment_risk: RiskComponent;
    whale_risk: RiskComponent;
    tvl_risk: RiskComponent;
    correlation_risk: RiskComponent;
  };
  actionable: string;
  metadata: { sources_queried: number; sources_ok: number; latency_ms: number; errors: string[] };
}

interface FearGreedResponse {
  data: Array<{ value: string; value_classification: string }>;
}

interface LlamaV2Chain {
  name: string;
  tvl: number;
}

async function buildRiskRadar(): Promise<RiskRadarResponse> {
  const start = Date.now();
  const errors: string[] = [];
  let sourcesOk = 0;

  const [fundingResult, whaleResult, fngResult, tvlResult] = await Promise.all([
    getFundingArbOpportunities().then(d => ({ ok: true as const, data: d })).catch(e => {
      const msg = `funding: ${e instanceof Error ? e.message : String(e)}`;
      errors.push(msg);
      return { ok: false as const, error: msg };
    }),
    getHyperliquidWhaleAlerts().then(d => ({ ok: true as const, data: d })).catch(e => {
      const msg = `whales: ${e instanceof Error ? e.message : String(e)}`;
      errors.push(msg);
      return { ok: false as const, error: msg };
    }),
    safeFetchJson<FearGreedResponse>('https://api.alternative.me/fng/?limit=1', 'fear-greed'),
    safeFetchJson<LlamaV2Chain[]>('https://api.llama.fi/v2/chains', 'defillama-tvl'),
  ]);

  if (fundingResult.ok) sourcesOk++;
  if (whaleResult.ok) sourcesOk++;
  if (fngResult.ok) sourcesOk++;
  else errors.push(fngResult.error);
  if (tvlResult.ok) sourcesOk++;
  else errors.push(tvlResult.error);

  // --- Funding Risk (0-20) ---
  let fundingScore = 0;
  let fundingDetail = 'No funding data available';
  if (fundingResult.ok) {
    const opps = fundingResult.data.opportunities || [];
    const extremeCount = opps.filter(o => Math.abs(o.hlFundingRate) > 0.0005).length;
    fundingScore = clamp(Math.round((extremeCount / Math.max(opps.length, 1)) * 20), 0, 20);
    const topExtreme = opps.sort((a, b) => Math.abs(b.hlFundingRate) - Math.abs(a.hlFundingRate))[0];
    fundingDetail = extremeCount > 0
      ? `${extremeCount}/${opps.length} assets have extreme funding rates. Top: ${topExtreme?.symbol || '?'} at ${((topExtreme?.hlFundingRate || 0) * 100).toFixed(4)}%`
      : `All ${opps.length} tracked assets have normal funding rates`;
  }

  // --- Sentiment Risk (0-20) ---
  let sentimentScore = 0;
  let sentimentDetail = 'Fear & Greed data unavailable';
  if (fngResult.ok) {
    const fng = fngResult.data?.data?.[0];
    if (fng) {
      const val = parseInt(fng.value, 10);
      if (val > 75) {
        sentimentScore = 20;
        sentimentDetail = `Extreme Greed (${val}/100: ${fng.value_classification}). Historically precedes corrections.`;
      } else if (val < 25) {
        sentimentScore = 15;
        sentimentDetail = `Extreme Fear (${val}/100: ${fng.value_classification}). Capitulation risk elevated.`;
      } else {
        sentimentScore = clamp(Math.round(Math.abs(val - 50) / 2.5), 0, 10);
        sentimentDetail = `${fng.value_classification} (${val}/100). Moderate sentiment.`;
      }
    }
  }

  // --- Whale Risk (0-20) ---
  let whaleScore = 0;
  let whaleDetail = 'Whale position data unavailable';
  if (whaleResult.ok) {
    const positions = whaleResult.data.topPositions || [];
    if (positions.length > 0) {
      let longCount = 0;
      let shortCount = 0;
      for (const p of positions) {
        if (p.side === 'LONG') longCount++;
        else shortCount++;
      }
      const total = longCount + shortCount;
      const dominantPct = total > 0 ? Math.max(longCount, shortCount) / total : 0;
      if (dominantPct > 0.6) {
        whaleScore = 20;
        const dominantSide = longCount > shortCount ? 'LONG' : 'SHORT';
        whaleDetail = `${(dominantPct * 100).toFixed(0)}% of whale positions are ${dominantSide} (${longCount}L/${shortCount}S). High concentration risk.`;
      } else {
        whaleScore = clamp(Math.round(dominantPct * 20), 0, 10);
        whaleDetail = `Whale positions balanced: ${longCount}L/${shortCount}S. Low concentration risk.`;
      }
    }
  }

  // --- TVL Risk (0-15) ---
  let tvlScore = 0;
  let tvlDetail = 'TVL data unavailable';
  if (tvlResult.ok && Array.isArray(tvlResult.data)) {
    const totalTvl = tvlResult.data.reduce((sum, c) => sum + (c.tvl || 0), 0);
    // We don't have historical data in this call, so note total TVL and flag if under $100B
    if (totalTvl < 100_000_000_000) {
      tvlScore = 15;
      tvlDetail = `Total DeFi TVL is $${(totalTvl / 1e9).toFixed(1)}B — below $100B threshold. Capital flight risk.`;
    } else if (totalTvl < 200_000_000_000) {
      tvlScore = 8;
      tvlDetail = `Total DeFi TVL is $${(totalTvl / 1e9).toFixed(1)}B — moderate level.`;
    } else {
      tvlScore = 0;
      tvlDetail = `Total DeFi TVL is $${(totalTvl / 1e9).toFixed(1)}B — healthy.`;
    }
  }

  // --- Correlation Risk (0-10) ---
  const elevatedComponents = [
    fundingScore > 10,
    sentimentScore > 10,
    whaleScore > 10,
    tvlScore > 8,
  ].filter(Boolean).length;

  let correlationScore = 0;
  let correlationDetail = 'No correlated risk signals detected';
  if (elevatedComponents >= 3) {
    correlationScore = 10;
    correlationDetail = `${elevatedComponents}/4 risk components elevated simultaneously. Correlated risk amplifies downside.`;
  } else if (elevatedComponents === 2) {
    correlationScore = 5;
    correlationDetail = `${elevatedComponents}/4 risk components elevated. Moderate correlation.`;
  }

  // --- Composite ---
  const riskScore = clamp(fundingScore + sentimentScore + whaleScore + tvlScore + correlationScore, 0, 100);
  const riskLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'EXTREME' =
    riskScore <= 30 ? 'LOW' :
    riskScore <= 50 ? 'MODERATE' :
    riskScore <= 75 ? 'HIGH' : 'EXTREME';

  // Build actionable summary
  const topFactors: string[] = [];
  if (fundingScore > 10) topFactors.push('extreme funding rates');
  if (sentimentScore > 10) topFactors.push('extreme market sentiment');
  if (whaleScore > 10) topFactors.push('whale position concentration');
  if (tvlScore > 8) topFactors.push('low DeFi TVL');
  if (correlationScore > 5) topFactors.push('correlated risk signals');

  const actionable = topFactors.length > 0
    ? `Risk is ${riskLevel.toLowerCase()} due to ${topFactors.join(', ')}.`
    : `Risk is ${riskLevel.toLowerCase()}. No major risk factors detected.`;

  return {
    timestamp: new Date().toISOString(),
    risk_score: riskScore,
    risk_level: riskLevel,
    components: {
      funding_risk: { score: fundingScore, detail: fundingDetail },
      sentiment_risk: { score: sentimentScore, detail: sentimentDetail },
      whale_risk: { score: whaleScore, detail: whaleDetail },
      tvl_risk: { score: tvlScore, detail: tvlDetail },
      correlation_risk: { score: correlationScore, detail: correlationDetail },
    },
    actionable,
    metadata: { sources_queried: 4, sources_ok: sourcesOk, latency_ms: Date.now() - start, errors },
  };
}

router.get('/risk-radar', softGate(), async (_req: Request, res: Response) => {
  try {
    const now = Date.now();
    if (riskRadarCache.entry && now < riskRadarCache.entry.expiresAt) {
      res.json(cloneJson(riskRadarCache.entry.data));
      return;
    }

    const data = await buildRiskRadar();
    riskRadarCache.entry = { data, expiresAt: now + CACHE_TTL_MS };
    res.json(cloneJson(data));
  } catch (err) {
    logger.error({ err }, 'risk-radar endpoint failed');
    res.status(500).json({ error: 'risk_radar_failed', message: err instanceof Error ? err.message : 'Unknown error' });
  }
});

export default router;

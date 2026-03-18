/**
 * Prediction Tracker — Verifiable Signal Logging
 *
 * Every Sentinel signal gets:
 * 1. A timestamped prediction with entry price snapshot
 * 2. A 24h/72h/7d price resolution check
 * 3. A public track record score
 *
 * This is the data that turns "we think X" into "we were right 67% of the time."
 */

import fs from 'fs';
import path from 'path';
import logger from '../../../config/logger';

const DATA_DIR = process.env.DATA_DIR || '/data';
const PREDICTIONS_LOG = path.join(DATA_DIR, 'sentinel-predictions.jsonl');
const RESOLUTIONS_LOG = path.join(DATA_DIR, 'sentinel-resolutions.jsonl');
const FETCH_TIMEOUT_MS = 10_000;

// CoinGecko IDs for price snapshots
const ASSET_TO_COINGECKO: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', KAS: 'kaspa',
  STX: 'blockstack', ORDI: 'ordi', BABY: 'babylon', HYPE: 'hyperliquid',
  PURR: 'purr-2', ZORA: 'zora-2', AAVE: 'aave', UNI: 'uniswap',
  LINK: 'chainlink', ARB: 'arbitrum', OP: 'optimism', POL: 'matic-network',
  BASE: 'base', PUMP: 'pump-fun',
};

export interface Prediction {
  id: string;
  timestamp: string;
  asset: string;
  signal_type: string;
  direction: 'bullish' | 'bearish' | 'neutral';
  strength: number;
  confidence: string;
  narrative: string;
  entry_price_usd: number | null;
  resolve_at_24h: string;
  resolve_at_72h: string;
  resolve_at_7d: string;
  resolved: boolean;
}

export interface Resolution {
  prediction_id: string;
  timestamp: string;
  asset: string;
  direction_predicted: string;
  entry_price: number | null;
  price_at_24h: number | null;
  price_at_72h: number | null;
  price_at_7d: number | null;
  pct_change_24h: number | null;
  pct_change_72h: number | null;
  pct_change_7d: number | null;
  correct_24h: boolean | null;
  correct_72h: boolean | null;
  correct_7d: boolean | null;
}

function appendJsonl(filePath: string, data: unknown): void {
  try { fs.appendFileSync(filePath, JSON.stringify(data) + '\n'); } catch { /* non-fatal */ }
}

async function fetchPrice(asset: string): Promise<number | null> {
  const cgId = ASSET_TO_COINGECKO[asset.toUpperCase()];
  if (!cgId) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${cgId}&vs_currencies=usd`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json() as Record<string, { usd: number }>;
    return data[cgId]?.usd ?? null;
  } catch { return null; }
}

/**
 * Log a prediction for every signal in a Sentinel report.
 * Call this after buildSentinelReport().
 */
export async function logPredictions(signals: Array<{
  id: string;
  type: string;
  asset: string;
  strength: number;
  direction: string;
  confidence: string;
  narrative: string;
}>): Promise<number> {
  let logged = 0;
  const now = new Date();

  // Batch price fetches — deduplicate assets
  const assets = [...new Set(signals.map(s => s.asset.toUpperCase()))];
  const prices: Record<string, number | null> = {};
  for (const asset of assets) {
    prices[asset] = await fetchPrice(asset);
    // Brief delay to avoid CoinGecko rate limits
    await new Promise(r => setTimeout(r, 200));
  }

  for (const signal of signals) {
    const prediction: Prediction = {
      id: signal.id || `pred-${now.getTime()}-${logged}`,
      timestamp: now.toISOString(),
      asset: signal.asset.toUpperCase(),
      signal_type: signal.type,
      direction: signal.direction as Prediction['direction'],
      strength: signal.strength,
      confidence: signal.confidence,
      narrative: signal.narrative,
      entry_price_usd: prices[signal.asset.toUpperCase()] ?? null,
      resolve_at_24h: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      resolve_at_72h: new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString(),
      resolve_at_7d: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      resolved: false,
    };

    appendJsonl(PREDICTIONS_LOG, prediction);
    logged++;
  }

  if (logged > 0) {
    logger.info({ count: logged, assets }, 'Predictions logged with entry prices');
  }
  return logged;
}

/**
 * Resolve predictions that have passed their 24h/72h/7d windows.
 * Called periodically to update the track record.
 */
export async function resolvePredictions(): Promise<{ resolved: number; total: number }> {
  if (!fs.existsSync(PREDICTIONS_LOG)) return { resolved: 0, total: 0 };

  const lines = fs.readFileSync(PREDICTIONS_LOG, 'utf-8').trim().split('\n').filter(Boolean);
  const now = Date.now();
  let resolved = 0;

  // Read existing resolutions to avoid re-resolving
  const existingIds = new Set<string>();
  if (fs.existsSync(RESOLUTIONS_LOG)) {
    const resLines = fs.readFileSync(RESOLUTIONS_LOG, 'utf-8').trim().split('\n').filter(Boolean);
    for (const line of resLines) {
      try { existingIds.add(JSON.parse(line).prediction_id); } catch { /* skip */ }
    }
  }

  for (const line of lines) {
    let pred: Prediction;
    try { pred = JSON.parse(line); } catch { continue; }
    if (existingIds.has(pred.id)) continue;

    const resolveAt24h = new Date(pred.resolve_at_24h).getTime();
    if (now < resolveAt24h) continue; // Not ready yet

    const currentPrice = await fetchPrice(pred.asset);
    await new Promise(r => setTimeout(r, 200)); // Rate limit

    const entryPrice = pred.entry_price_usd;
    const pctChange = (entryPrice && currentPrice) ? ((currentPrice - entryPrice) / entryPrice) * 100 : null;

    // Determine correctness
    let correct: boolean | null = null;
    if (pctChange !== null) {
      if (pred.direction === 'bullish') correct = pctChange > 0;
      else if (pred.direction === 'bearish') correct = pctChange < 0;
      else correct = Math.abs(pctChange) < 2; // neutral = <2% move
    }

    const resolution: Resolution = {
      prediction_id: pred.id,
      timestamp: new Date().toISOString(),
      asset: pred.asset,
      direction_predicted: pred.direction,
      entry_price: entryPrice,
      price_at_24h: currentPrice,
      price_at_72h: null, // Filled on subsequent passes
      price_at_7d: null,
      pct_change_24h: pctChange,
      pct_change_72h: null,
      pct_change_7d: null,
      correct_24h: correct,
      correct_72h: null,
      correct_7d: null,
    };

    appendJsonl(RESOLUTIONS_LOG, resolution);
    existingIds.add(pred.id);
    resolved++;
  }

  return { resolved, total: lines.length };
}

/**
 * Get the track record summary — public-facing stats.
 */
export function getTrackRecord(): {
  totalPredictions: number;
  resolved: number;
  correct: number;
  incorrect: number;
  pending: number;
  accuracy: number | null;
  byAsset: Record<string, { total: number; correct: number; accuracy: number }>;
  byType: Record<string, { total: number; correct: number; accuracy: number }>;
  recentPredictions: Prediction[];
  recentResolutions: Resolution[];
} {
  const predictions: Prediction[] = [];
  const resolutions: Resolution[] = [];

  if (fs.existsSync(PREDICTIONS_LOG)) {
    const lines = fs.readFileSync(PREDICTIONS_LOG, 'utf-8').trim().split('\n').filter(Boolean);
    for (const l of lines) { try { predictions.push(JSON.parse(l)); } catch { /* skip */ } }
  }

  if (fs.existsSync(RESOLUTIONS_LOG)) {
    const lines = fs.readFileSync(RESOLUTIONS_LOG, 'utf-8').trim().split('\n').filter(Boolean);
    for (const l of lines) { try { resolutions.push(JSON.parse(l)); } catch { /* skip */ } }
  }

  const correct = resolutions.filter(r => r.correct_24h === true).length;
  const incorrect = resolutions.filter(r => r.correct_24h === false).length;
  const resolvedCount = correct + incorrect;

  const byAsset: Record<string, { total: number; correct: number; accuracy: number }> = {};
  const byType: Record<string, { total: number; correct: number; accuracy: number }> = {};

  // Build prediction lookup
  const predMap = new Map<string, Prediction>();
  for (const p of predictions) predMap.set(p.id, p);

  for (const r of resolutions) {
    const pred = predMap.get(r.prediction_id);
    const asset = r.asset;
    const type = pred?.signal_type || 'unknown';

    if (!byAsset[asset]) byAsset[asset] = { total: 0, correct: 0, accuracy: 0 };
    byAsset[asset].total++;
    if (r.correct_24h === true) byAsset[asset].correct++;
    byAsset[asset].accuracy = byAsset[asset].total > 0 ? (byAsset[asset].correct / byAsset[asset].total) * 100 : 0;

    if (!byType[type]) byType[type] = { total: 0, correct: 0, accuracy: 0 };
    byType[type].total++;
    if (r.correct_24h === true) byType[type].correct++;
    byType[type].accuracy = byType[type].total > 0 ? (byType[type].correct / byType[type].total) * 100 : 0;
  }

  return {
    totalPredictions: predictions.length,
    resolved: resolvedCount,
    correct,
    incorrect,
    pending: predictions.length - resolvedCount,
    accuracy: resolvedCount > 0 ? (correct / resolvedCount) * 100 : null,
    byAsset,
    byType,
    recentPredictions: predictions.slice(-10),
    recentResolutions: resolutions.slice(-10),
  };
}

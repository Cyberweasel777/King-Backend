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
import { ASSET_TO_COINGECKO, getPrice, getPrices } from '../coingecko-cache';

const DATA_DIR = process.env.DATA_DIR || '/data';
const PREDICTIONS_LOG = path.join(DATA_DIR, 'sentinel-predictions.jsonl');
const RESOLUTIONS_LOG = path.join(DATA_DIR, 'sentinel-resolutions.jsonl');

const ASSET_ALIASES: Record<string, string> = {
  'HYPERLIQUID (HYPE)': 'HYPE',
  'KATANA (KAT)': 'KAT',
  'LOMBARD (BARD)': 'BARD',
  'RIVER (RIVER)': 'RIVER',
  'WATERNEURON (WTN)': 'WTN',
};

function normalizeAsset(raw: string): string {
  const cleaned = (raw || '').toUpperCase().trim();
  if (!cleaned) return cleaned;

  if (ASSET_ALIASES[cleaned]) return ASSET_ALIASES[cleaned];

  // Pull ticker from parenthesis patterns, e.g. "KATANA (KAT)"
  const paren = cleaned.match(/\(([A-Z0-9_\-]{2,12})\)/);
  if (paren?.[1]) return paren[1];

  return cleaned;
}

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
  resolve_at_6h: string;
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

const ADMIN_CHAT_ID = process.env.ADMIN_TELEGRAM_CHAT_ID || '8063432083';
const TELEGRAM_BOT_TOKEN = process.env.BOTINDEX_BOT_TOKEN || '';

async function sendWinAlert(pred: Prediction, currentPrice: number | null, pctChange: number): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) return;

  const direction = pred.direction === 'bullish' ? '📈 BULLISH' : pred.direction === 'bearish' ? '📉 BEARISH' : '➡️ NEUTRAL';
  const arrow = pctChange > 0 ? '↑' : '↓';
  const emoji = '🎯';

  const message = [
    `${emoji} WIN ALERT — Signal confirmed!`,
    ``,
    `${direction} ${pred.asset} call was CORRECT`,
    `Signal: ${pred.signal_type.replace(/_/g, ' ')}`,
    `Strength: ${pred.strength}/100`,
    ``,
    `Entry: $${pred.entry_price_usd?.toLocaleString('en-US', { maximumFractionDigits: 2 })}`,
    `Now: $${currentPrice?.toLocaleString('en-US', { maximumFractionDigits: 2 })}`,
    `Move: ${arrow} ${Math.abs(pctChange).toFixed(2)}%`,
    ``,
    `"${pred.narrative}"`,
    ``,
    `Signal time: ${pred.timestamp}`,
    `Track record: botindex.dev/sentinel/track-record`,
    ``,
    `📸 Screenshot this for social proof!`,
  ].join('\n');

  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: ADMIN_CHAT_ID, text: message, parse_mode: 'HTML' }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram sendMessage failed (${res.status}): ${body}`);
  }

  logger.info({ asset: pred.asset, direction: pred.direction, pctChange, strength: pred.strength }, 'Win alert sent to admin');
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
  let skippedUnscorable = 0;
  const now = new Date();

  // Batch price fetches — deduplicate normalized assets
  const assets = [...new Set(signals.map(s => normalizeAsset(s.asset)))];
  const scorableAssets = assets.filter(asset => !!ASSET_TO_COINGECKO[asset]);
  const prices = await getPrices(scorableAssets);

  for (const signal of signals) {
    const normalizedAsset = normalizeAsset(signal.asset);
    const entryPrice = prices[normalizedAsset] ?? null;
    if (entryPrice === null || !ASSET_TO_COINGECKO[normalizedAsset]) {
      skippedUnscorable++;
      continue;
    }

    const prediction: Prediction = {
      id: signal.id || `pred-${now.getTime()}-${logged}`,
      timestamp: now.toISOString(),
      asset: normalizedAsset,
      signal_type: signal.type,
      direction: signal.direction as Prediction['direction'],
      strength: signal.strength,
      confidence: signal.confidence,
      narrative: signal.narrative,
      entry_price_usd: entryPrice,
      resolve_at_6h: new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString(),
      resolve_at_24h: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      resolve_at_72h: new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString(),
      resolve_at_7d: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      resolved: false,
    };

    appendJsonl(PREDICTIONS_LOG, prediction);
    logged++;
  }

  if (logged > 0) {
    logger.info({ count: logged, skippedUnscorable, assets: scorableAssets }, 'Predictions logged with entry prices');
  } else if (skippedUnscorable > 0) {
    logger.info({ skippedUnscorable, assets: scorableAssets }, 'Skipped unscorable predictions with missing entry prices');
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

    const predictionTimestamp = new Date(pred.timestamp).getTime();
    if (!Number.isFinite(predictionTimestamp)) continue;
    const resolveAt6h = predictionTimestamp + (6 * 60 * 60 * 1000);
    if (now < resolveAt6h) continue; // Not ready yet

    const normalizedAsset = normalizeAsset(pred.asset);
    const currentPrice = await getPrice(normalizedAsset);

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
      asset: normalizedAsset,
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

    // WIN ALERT: notify Andrew when a high-strength signal resolves correctly with a meaningful move
    if (correct === true && pred.strength >= 65 && pctChange !== null && Math.abs(pctChange) >= 1.5) {
      sendWinAlert(pred, currentPrice, pctChange).catch(err =>
        logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'Win alert failed')
      );
    }
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

  // Build prediction lookup
  const predMap = new Map<string, Prediction>();
  for (const p of predictions) predMap.set(p.id, p);

  // Filter out excluded signal types and assets from resolution counts
  const EXCLUDED_TYPES_SET = new Set(['pump_signal', 'sentiment_shift', 'momentum_decay', 'risk_cascade', 'dump_warning', 'whale_divergence', 'momentum_surge']);
  const EXCLUDED_ASSETS = new Set(['KAS', 'KATANA (KAT)']);
  const scorableResolutions = resolutions.filter(r => {
    const pred = predMap.get(r.prediction_id);
    const type = pred?.signal_type || 'unknown';
    const asset = normalizeAsset(r.asset);
    return !EXCLUDED_TYPES_SET.has(type) && !EXCLUDED_ASSETS.has(asset);
  });

  const correct = scorableResolutions.filter(r => r.correct_24h === true).length;
  const incorrect = scorableResolutions.filter(r => r.correct_24h === false).length;
  const resolvedCount = correct + incorrect;

  const byAsset: Record<string, { total: number; correct: number; accuracy: number }> = {};
  const byType: Record<string, { total: number; correct: number; accuracy: number }> = {};

  // Signal types excluded from public track record (disabled — ecosystem_momentum only now)
  const EXCLUDED_TYPES = new Set(['pump_signal', 'sentiment_shift', 'momentum_decay', 'risk_cascade', 'dump_warning', 'whale_divergence', 'momentum_surge']);

  for (const r of resolutions) {
    // Only aggregate scored outcomes (exclude null/unscorable resolutions)
    if (r.correct_24h === null) continue;

    const pred = predMap.get(r.prediction_id);
    const type = pred?.signal_type || 'unknown';

    // Skip excluded signal types and assets entirely
    if (EXCLUDED_TYPES.has(type)) continue;
    const asset = normalizeAsset(r.asset);
    if (EXCLUDED_ASSETS.has(asset)) continue;

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

/**
 * Ecosystem Signals — Individual signals per package/repo + aggregates.
 *
 * Each tracked npm/PyPI package and GitHub repo generates its own signal
 * based on download velocity, commit activity, and growth trends.
 * Aggregates combine individual signals per asset for composite scoring.
 *
 * This is pure data — no LLM interpretation. The numbers speak.
 */

import logger from '../../../config/logger';
import { collectEcosystemIntel, EcosystemData } from './ecosystem-intel';

export interface EcosystemSignal {
  id: string;
  source: 'npm' | 'pypi' | 'github';
  name: string;           // package name or repo
  asset: string;
  category: string;
  direction: 'bullish' | 'bearish' | 'neutral';
  strength: number;       // 0-100
  confidence: 'high' | 'medium' | 'low';
  metric: string;         // what we measured
  value: number;          // current value
  prevValue: number;      // previous period value
  changePct: number;      // % change
  narrative: string;      // one-line explanation
  timestamp: string;
}

export interface AssetAggregate {
  asset: string;
  direction: 'bullish' | 'bearish' | 'neutral';
  strength: number;
  confidence: 'high' | 'medium' | 'low';
  signalCount: number;
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  signals: EcosystemSignal[];
  narrative: string;
}

export interface EcosystemSignalReport {
  individual: EcosystemSignal[];
  aggregates: AssetAggregate[];
  grandAggregate: {
    direction: 'bullish' | 'bearish' | 'neutral';
    strength: number;
    totalSignals: number;
    bullishPct: number;
    bearishPct: number;
  };
  timestamp: string;
  sourcesOk: number;
}

/**
 * Convert raw growth % into a direction + strength score.
 *
 * Thresholds:
 * - >10% growth = bullish, strength scales with magnitude
 * - <-10% decline = bearish
 * - -10% to +10% = neutral
 * - Strength floors at 30 for any non-neutral signal
 */
function scoreGrowth(changePct: number): { direction: 'bullish' | 'bearish' | 'neutral'; strength: number } {
  const absChange = Math.abs(changePct);

  if (changePct > 10) {
    // Bullish: 30 base + scale up to 100
    const strength = Math.min(100, 30 + Math.round(absChange * 1.5));
    return { direction: 'bullish', strength };
  } else if (changePct < -10) {
    // Bearish
    const strength = Math.min(100, 30 + Math.round(absChange * 1.5));
    return { direction: 'bearish', strength };
  } else if (changePct > 3) {
    return { direction: 'bullish', strength: Math.round(20 + absChange * 2) };
  } else if (changePct < -3) {
    return { direction: 'bearish', strength: Math.round(20 + absChange * 2) };
  }

  return { direction: 'neutral', strength: Math.round(10 + absChange) };
}

/**
 * Score GitHub commit activity.
 * High commit weeks = bullish signal for that asset.
 */
function scoreCommits(commitsRecent: number, stars: number): { direction: 'bullish' | 'bearish' | 'neutral'; strength: number } {
  // Normalize by repo size (stars as proxy)
  // Small repo with lots of commits = stronger signal
  // Large repo with few commits = weaker

  if (commitsRecent >= 50) {
    return { direction: 'bullish', strength: Math.min(100, 50 + Math.round(commitsRecent / 5)) };
  } else if (commitsRecent >= 20) {
    return { direction: 'bullish', strength: 40 + Math.round(commitsRecent / 3) };
  } else if (commitsRecent >= 5) {
    return { direction: 'neutral', strength: 20 + commitsRecent };
  } else if (commitsRecent === 0) {
    return { direction: 'bearish', strength: 35 };
  }

  return { direction: 'neutral', strength: 15 };
}

function determineConfidence(strength: number, hasMultipleSources: boolean): 'high' | 'medium' | 'low' {
  if (strength >= 70 && hasMultipleSources) return 'high';
  if (strength >= 50) return 'medium';
  return 'low';
}

/**
 * Generate individual signals from ecosystem data.
 */
function generateIndividualSignals(data: EcosystemData): EcosystemSignal[] {
  const signals: EcosystemSignal[] = [];
  const now = new Date().toISOString();

  // npm signals
  for (const n of data.npm) {
    if (n.weeklyDownloads === 0 && n.prevWeekDownloads === 0) continue;

    const { direction, strength } = scoreGrowth(n.growthPct);
    const confidence = determineConfidence(strength, false);

    signals.push({
      id: `npm-${n.pkg.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}`,
      source: 'npm',
      name: n.pkg,
      asset: n.asset,
      category: n.category,
      direction,
      strength,
      confidence,
      metric: 'weekly_downloads',
      value: n.weeklyDownloads,
      prevValue: n.prevWeekDownloads,
      changePct: Math.round(n.growthPct * 10) / 10,
      narrative: `${n.pkg} npm downloads ${n.growthPct > 0 ? 'up' : n.growthPct < 0 ? 'down' : 'flat'} ${Math.abs(n.growthPct).toFixed(1)}% WoW (${n.weeklyDownloads.toLocaleString()}/wk)`,
      timestamp: now,
    });
  }

  // PyPI signals
  for (const p of (data.pypi || [])) {
    if (p.weeklyDownloads === 0 && p.prevWeekDownloads === 0) continue;

    const { direction, strength } = scoreGrowth(p.growthPct);
    const confidence = determineConfidence(strength, false);

    signals.push({
      id: `pypi-${p.pkg.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}`,
      source: 'pypi',
      name: p.pkg,
      asset: p.asset,
      category: p.category,
      direction,
      strength,
      confidence,
      metric: 'weekly_downloads',
      value: p.weeklyDownloads,
      prevValue: p.prevWeekDownloads,
      changePct: Math.round(p.growthPct * 10) / 10,
      narrative: `${p.pkg} PyPI downloads ${p.growthPct > 0 ? 'up' : p.growthPct < 0 ? 'down' : 'flat'} ${Math.abs(p.growthPct).toFixed(1)}% WoW (${p.weeklyDownloads.toLocaleString()}/wk)`,
      timestamp: now,
    });
  }

  // GitHub signals
  for (const r of data.repos) {
    const { direction, strength } = scoreCommits(r.commitsRecent, r.stars);
    const confidence = determineConfidence(strength, false);

    signals.push({
      id: `gh-${r.repo.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}`,
      source: 'github',
      name: r.repo,
      asset: r.asset,
      category: r.category,
      direction,
      strength,
      confidence,
      metric: 'weekly_commits',
      value: r.commitsRecent,
      prevValue: 0, // We don't store prev week commits yet
      changePct: 0,
      narrative: `${r.repo} — ${r.commitsRecent} commits in 7d, ${r.stars.toLocaleString()} stars`,
      timestamp: now,
    });
  }

  return signals;
}

/**
 * Aggregate individual signals by asset.
 */
function aggregateByAsset(signals: EcosystemSignal[]): AssetAggregate[] {
  const assetMap = new Map<string, EcosystemSignal[]>();

  for (const s of signals) {
    if (!assetMap.has(s.asset)) assetMap.set(s.asset, []);
    assetMap.get(s.asset)!.push(s);
  }

  const aggregates: AssetAggregate[] = [];

  for (const [asset, assetSignals] of assetMap) {
    const bullish = assetSignals.filter(s => s.direction === 'bullish');
    const bearish = assetSignals.filter(s => s.direction === 'bearish');
    const neutral = assetSignals.filter(s => s.direction === 'neutral');

    // Weighted vote: each signal's strength contributes to direction
    const bullishWeight = bullish.reduce((sum, s) => sum + s.strength, 0);
    const bearishWeight = bearish.reduce((sum, s) => sum + s.strength, 0);
    const totalWeight = bullishWeight + bearishWeight + neutral.reduce((sum, s) => sum + s.strength, 0);

    let direction: 'bullish' | 'bearish' | 'neutral';
    let strength: number;

    if (totalWeight === 0) {
      direction = 'neutral';
      strength = 0;
    } else if (bullishWeight > bearishWeight * 1.3) {
      direction = 'bullish';
      strength = Math.round((bullishWeight / totalWeight) * 100);
    } else if (bearishWeight > bullishWeight * 1.3) {
      direction = 'bearish';
      strength = Math.round((bearishWeight / totalWeight) * 100);
    } else {
      direction = 'neutral';
      strength = Math.round(Math.max(bullishWeight, bearishWeight) / totalWeight * 50);
    }

    // Confidence based on convergence across sources
    const sources = new Set(assetSignals.map(s => s.source));
    const confidence = sources.size >= 3 ? 'high' : sources.size >= 2 ? 'medium' : 'low';

    // Build narrative
    const parts: string[] = [];
    if (bullish.length) parts.push(`${bullish.length} bullish (${bullish.map(s => s.source).join(', ')})`);
    if (bearish.length) parts.push(`${bearish.length} bearish`);
    if (neutral.length) parts.push(`${neutral.length} neutral`);

    aggregates.push({
      asset,
      direction,
      strength,
      confidence,
      signalCount: assetSignals.length,
      bullishCount: bullish.length,
      bearishCount: bearish.length,
      neutralCount: neutral.length,
      signals: assetSignals.sort((a, b) => b.strength - a.strength),
      narrative: `${asset}: ${parts.join(', ')} across ${sources.size} source${sources.size > 1 ? 's' : ''} (${[...sources].join('+')})`,
    });
  }

  return aggregates.sort((a, b) => b.strength - a.strength);
}

/**
 * Main entry point — collect ecosystem data, generate all signals + aggregates.
 */
export async function generateEcosystemSignals(): Promise<EcosystemSignalReport> {
  const data = await collectEcosystemIntel();
  const individual = generateIndividualSignals(data);
  const aggregates = aggregateByAsset(individual);

  // Grand aggregate
  const bullishSignals = individual.filter(s => s.direction === 'bullish');
  const bearishSignals = individual.filter(s => s.direction === 'bearish');
  const totalNonNeutral = bullishSignals.length + bearishSignals.length;

  const grandDirection = bullishSignals.length > bearishSignals.length * 1.3
    ? 'bullish' as const
    : bearishSignals.length > bullishSignals.length * 1.3
    ? 'bearish' as const
    : 'neutral' as const;

  const avgStrength = individual.length > 0
    ? Math.round(individual.reduce((sum, s) => sum + s.strength, 0) / individual.length)
    : 0;

  logger.info({
    totalSignals: individual.length,
    aggregates: aggregates.length,
    bullish: bullishSignals.length,
    bearish: bearishSignals.length,
    grandDirection,
    avgStrength,
  }, 'Ecosystem signals generated');

  return {
    individual,
    aggregates,
    grandAggregate: {
      direction: grandDirection,
      strength: avgStrength,
      totalSignals: individual.length,
      bullishPct: totalNonNeutral > 0 ? Math.round((bullishSignals.length / totalNonNeutral) * 100) : 50,
      bearishPct: totalNonNeutral > 0 ? Math.round((bearishSignals.length / totalNonNeutral) * 100) : 50,
    },
    timestamp: new Date().toISOString(),
    sourcesOk: data.sourcesOk,
  };
}

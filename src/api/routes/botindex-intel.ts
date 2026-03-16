/**
 * BotIndex Intel Routes — DeepSeek-powered intelligence.
 *
 * Domain intel endpoints are free-to-call with teaser responses for anonymous/free users.
 * Paid API keys receive full reports.
 *
 * Alpha Scan is the premium flagship endpoint ($0.10/call via x402 or paid API key bypass).
 */

import { NextFunction, Request, Response, Router } from 'express';
import { createX402Gate } from '../middleware/x402Gate';
import logger from '../../config/logger';
import { generateIntelReport, IntelReport } from '../../services/botindex/intel/engine';
import {
  zoraIntelConfig,
  hyperliquidIntelConfig,
  cryptoIntelConfig,
  dopplerIntelConfig,
  alphaScanConfig,
} from '../../services/botindex/intel/domains';
import { trackFunnelEvent } from '../../services/botindex/funnel-tracker';

// Import raw data fetchers
import { getZoraTrendingCoins } from '../../services/botindex/zora/trending';
import { getAttentionMomentum } from '../../services/botindex/zora/attention';
import { getZoraCreatorScores } from '../../services/botindex/zora/creator-scores';
import { getFundingArbOpportunities } from '../../services/botindex/hyperliquid/funding-arb';
import { getHLCorrelationMatrix } from '../../services/botindex/hyperliquid/correlation';
import { getHyperliquidWhaleAlerts } from '../../services/botindex/hyperliquid/whale-alerts';
import { scanMemeTokenVelocity } from '../../services/botindex/meme/velocityScanner';
import { getTradeSignals } from '../../services/botindex/intelligence/trade-signals';
import {
  PortfolioDirection,
  PortfolioPosition,
  scanPortfolioRisk,
} from '../../services/botindex/intelligence/portfolio-risk';
import { detectSignalConvergence } from '../../services/botindex/intelligence/convergence-detector';
import { analyzeLaunchAlpha } from '../../services/botindex/intelligence/launch-alpha';

const router = Router();

const BASE_METADATA = {
  protocol: 'x402',
  version: '1.0',
  provider: 'Renaldo Corp / BotIndex',
} as const;

const TEASER_REASONING_SUFFIX = '... [upgrade for full analysis]';
const ALPHA_SCAN_CACHE_TTL_MS = 5 * 60 * 1000;
const BASIC_REGISTRATION_LINK = 'https://king-backend.fly.dev/api/botindex/keys/register?plan=basic';

const INTEL_UPGRADE = {
  message: 'Upgrade to unlock full multi-asset intel and complete reasoning.',
  pro: {
    register: 'https://api.botindex.dev/api/botindex/keys/register?plan=pro',
    pricing: '$29/mo',
    description: 'Unlimited full intel reports via API key subscription',
  },
  x402: {
    endpoint: '/api/botindex/alpha-scan',
    pricing: '$0.10/call',
    description: 'Premium cross-market Alpha Scan via x402 pay-per-call',
    docs: 'https://www.x402.org',
  },
} as const;

const alphaScanGate = createX402Gate({
  price: '$0.10',
  description: 'BotIndex Alpha Scan convergence intelligence (0.10 USDC)',
});

let alphaScanCache: { report: IntelReport; expiresAt: number } | null = null;
let alphaScanInFlight: Promise<IntelReport> | null = null;

function isPaidApiKey(req: Request): boolean {
  return req.apiKeyAuth?.plan === 'pro' || req.apiKeyAuth?.plan === 'basic' || req.apiKeyAuth?.plan === 'starter';
}

function hasFullIntelAccess(req: Request): boolean {
  if (isPaidApiKey(req)) return true;

  return Boolean(
    (req as any).__apiKeyAuthenticated ||
    (req as any).__billingMode === 'subscription' ||
    (req as any).__freeTrialAuthenticated
  );
}

function hasFullAccess(req: Request): boolean {
  const hasPaidPlan = req.apiKeyAuth?.plan === 'pro' || req.apiKeyAuth?.plan === 'basic' || req.apiKeyAuth?.plan === 'starter';
  const hasBypass = Boolean((req as any).__apiKeyAuthenticated);
  return hasPaidPlan || hasBypass;
}

function truncateReasoning(reasoning: string): string {
  const normalized = String(reasoning || '').trim();
  const clipped = normalized.slice(0, 50).trimEnd();
  return `${clipped}${TEASER_REASONING_SUFFIX}`;
}

function truncateTeaserReasoning(reasoning: string, maxLength: number = 96): string {
  const normalized = String(reasoning || '').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

function normalizePortfolioDirection(value: unknown): PortfolioDirection | null {
  if (typeof value !== 'string') return null;
  const direction = value.trim().toLowerCase();
  return direction === 'long' || direction === 'short' ? direction : null;
}

function normalizePositionsInput(value: unknown): PortfolioPosition[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const positions: PortfolioPosition[] = [];

  for (const row of value) {
    if (typeof row !== 'object' || row === null) return null;
    const input = row as Record<string, unknown>;
    const asset = typeof input.asset === 'string' ? input.asset.trim().toUpperCase() : '';
    const direction = normalizePortfolioDirection(input.direction);
    const sizePct = Number(input.size_pct);

    if (!asset || !direction || !Number.isFinite(sizePct) || sizePct <= 0) {
      return null;
    }

    positions.push({
      asset,
      direction,
      size_pct: sizePct,
    });
  }

  return positions;
}

function truncateMarketSummary(summary: string): string {
  const normalized = String(summary || '').trim();
  if (normalized.length <= 100) {
    return normalized;
  }
  return `${normalized.slice(0, 100).trimEnd()}...`;
}

type VerdictAction = 'TRADE' | 'HOLD' | 'AVOID' | 'MONITOR' | 'HEDGE' | 'CLEAR';

type EndpointVerdict = {
  action: VerdictAction;
  confidence: number;
  one_liner: string;
};

type MissedPayload = {
  count: number;
  description: string;
  highest_hidden_confidence: number;
  [key: string]: string | number;
};

function directionToTradeAction(direction: string, confidence: number): VerdictAction {
  const normalizedDirection = direction.toUpperCase();
  if (normalizedDirection === 'LONG' || normalizedDirection === 'SHORT') {
    return confidence >= 40 ? 'TRADE' : 'AVOID';
  }
  return confidence >= 40 ? 'HOLD' : 'AVOID';
}

function buildTradeSignalsVerdict(analysis: Awaited<ReturnType<typeof getTradeSignals>>): EndpointVerdict {
  const topSignal = analysis.signals[0];
  if (!topSignal) {
    return {
      action: 'HOLD',
      confidence: 0,
      one_liner: 'No actionable signal detected in the current scan window.',
    };
  }

  return {
    action: directionToTradeAction(topSignal.direction, topSignal.confidence),
    confidence: topSignal.confidence,
    one_liner: `Top signal: ${topSignal.asset} ${topSignal.direction}, ${topSignal.confidence}% confidence. ${topSignal.timeframe}.`,
  };
}

function buildTradeSignalsMissed(analysis: Awaited<ReturnType<typeof getTradeSignals>>): MissedPayload {
  const hiddenSignals = analysis.signals.slice(1);
  const hiddenHighConfidence = hiddenSignals.filter((signal) => signal.confidence > 80);
  const highestHiddenConfidence = hiddenSignals.reduce((max, signal) => Math.max(max, signal.confidence), 0);

  return {
    count: hiddenSignals.length,
    description: hiddenHighConfidence.length > 0
      ? `${hiddenHighConfidence.length} signals with confidence >80% are hidden`
      : `${hiddenSignals.length} additional signals are hidden`,
    highest_hidden_confidence: highestHiddenConfidence,
  };
}

function buildConvergenceVerdict(analysis: Awaited<ReturnType<typeof detectSignalConvergence>>): EndpointVerdict {
  const topConvergence = analysis.convergences[0];
  if (!topConvergence) {
    return {
      action: 'MONITOR',
      confidence: 0,
      one_liner: 'No convergence setup is currently strong enough for action.',
    };
  }

  const action: VerdictAction =
    topConvergence.direction === 'NEUTRAL'
      ? 'MONITOR'
      : topConvergence.confidence >= 60
        ? 'TRADE'
        : 'MONITOR';

  return {
    action,
    confidence: topConvergence.confidence,
    one_liner: `${topConvergence.signal_count} signals converging on ${topConvergence.asset}. Direction: ${topConvergence.direction}. Expected: ${topConvergence.expected_move}.`,
  };
}

function buildConvergenceMissed(analysis: Awaited<ReturnType<typeof detectSignalConvergence>>): MissedPayload {
  const hiddenConvergences = analysis.convergences.slice(1);
  const strongestHiddenSignalCount = hiddenConvergences.reduce(
    (max, row) => Math.max(max, row.signal_count),
    0,
  );
  const highestHiddenConfidence = hiddenConvergences.reduce((max, row) => Math.max(max, row.confidence), 0);

  return {
    count: hiddenConvergences.length,
    description: `${hiddenConvergences.length} convergence setups are hidden. Strongest hidden setup combines ${strongestHiddenSignalCount} signals.`,
    highest_hidden_confidence: highestHiddenConfidence,
    strongest_hidden_signal_count: strongestHiddenSignalCount,
  };
}

function entryConfidenceToScore(entryConfidence: string): number {
  const normalized = entryConfidence.toUpperCase();
  if (normalized === 'HIGH') return 92;
  if (normalized === 'MEDIUM') return 72;
  if (normalized === 'LOW') return 45;
  if (normalized === 'AVOID') return 20;
  return 40;
}

function launchConfidenceToAction(entryConfidence: string): VerdictAction {
  const normalized = entryConfidence.toUpperCase();
  if (normalized === 'HIGH' || normalized === 'MEDIUM') return 'TRADE';
  if (normalized === 'LOW') return 'MONITOR';
  return 'AVOID';
}

function buildLaunchAlphaVerdict(analysis: Awaited<ReturnType<typeof analyzeLaunchAlpha>>): EndpointVerdict {
  const topLaunch = analysis.launches[0];
  if (!topLaunch) {
    return {
      action: 'MONITOR',
      confidence: 0,
      one_liner: 'No launch candidate currently meets minimum entry criteria.',
    };
  }

  return {
    action: launchConfidenceToAction(topLaunch.entry_confidence),
    confidence: entryConfidenceToScore(topLaunch.entry_confidence),
    one_liner: `Top launch: ${topLaunch.token}, entry confidence ${topLaunch.entry_confidence}. ${truncateTeaserReasoning(topLaunch.reasoning, 72)}.`,
  };
}

function buildLaunchAlphaMissed(analysis: Awaited<ReturnType<typeof analyzeLaunchAlpha>>): MissedPayload {
  const hiddenLaunches = analysis.launches.slice(1);
  const highestHiddenConfidence = hiddenLaunches.reduce(
    (max, row) => Math.max(max, entryConfidenceToScore(row.entry_confidence)),
    0,
  );

  return {
    count: hiddenLaunches.length,
    description: `${hiddenLaunches.length} launch candidates are hidden. Highest hidden entry confidence is ${highestHiddenConfidence}/100.`,
    highest_hidden_confidence: highestHiddenConfidence,
  };
}

function buildPortfolioRiskVerdict(analysis: Awaited<ReturnType<typeof scanPortfolioRisk>>): EndpointVerdict {
  let action: VerdictAction = 'HOLD';
  if (analysis.risk_level === 'CRITICAL' || analysis.risk_level === 'HIGH') {
    action = 'HEDGE';
  } else if (analysis.risk_level === 'MEDIUM') {
    action = 'MONITOR';
  }

  const firstHedge = analysis.hedge_recommendations[0];
  const hedgeSnippet = firstHedge
    ? `${firstHedge.action} (${firstHedge.size}).`
    : 'Reduce concentration before adding risk.';

  return {
    action,
    confidence: analysis.overall_risk_score,
    one_liner: `Portfolio risk ${analysis.overall_risk_score}/100 (${analysis.risk_level}). ${hedgeSnippet}`,
  };
}

function buildPortfolioRiskMissed(analysis: Awaited<ReturnType<typeof scanPortfolioRisk>>): MissedPayload {
  const hiddenCorrelatedPairs = analysis.correlated_pairs.length;
  const hiddenHedges = analysis.hedge_recommendations.length;

  return {
    count: hiddenCorrelatedPairs + hiddenHedges,
    description: `${hiddenCorrelatedPairs} correlated pair details and ${hiddenHedges} hedge recommendations are hidden`,
    highest_hidden_confidence: analysis.overall_risk_score,
  };
}

function buildTeaserReport(report: IntelReport) {
  const topAsset = report.assets[0];

  return {
    ...report,
    assets: topAsset
      ? [{
          ...topAsset,
          reasoning: truncateReasoning(topAsset.reasoning),
        }]
      : [],
    marketSummary: truncateMarketSummary(report.marketSummary),
    topPick: null,
    upgrade: INTEL_UPGRADE,
    isTruncated: true,
  };
}

function sendIntelResponse(
  req: Request,
  res: Response,
  report: IntelReport,
  metadata: Record<string, unknown>
): void {
  if (hasFullIntelAccess(req)) {
    res.json({
      ...report,
      isTruncated: false,
      metadata: {
        ...metadata,
        tier: 'full',
        access: 'subscription',
      },
    });
    return;
  }

  trackFunnelEvent('paywall_hit', { endpoint: req.path, plan: 'free' });
  trackFunnelEvent('upgrade_cta_shown', { endpoint: req.path });
  res.json({
    ...buildTeaserReport(report),
    metadata: {
      ...metadata,
      tier: 'teaser',
      access: 'free',
    },
  });
}

function preventFreeApiKeyBypass(req: Request, _res: Response, next: NextFunction): void {
  // createX402Gate currently bypasses for any req.apiKeyAuth object.
  // For premium-only endpoints, free keys must still pay via x402.
  if (req.apiKeyAuth?.plan === 'free') {
    delete req.apiKeyAuth;
  }
  next();
}

async function generateAlphaScanReport(): Promise<IntelReport> {
  const [whales, funding, zora, correlation, memeVelocity] = await Promise.all([
    getHyperliquidWhaleAlerts(),
    getFundingArbOpportunities(),
    getZoraTrendingCoins(20),
    getHLCorrelationMatrix(),
    scanMemeTokenVelocity(),
  ]);

  // Engine-level cache key is domain-only. Use 5-min buckets to enforce 5-min refresh.
  const cacheBucket = Math.floor(Date.now() / ALPHA_SCAN_CACHE_TTL_MS);
  const report = await generateIntelReport(
    { ...alphaScanConfig, domain: `alpha-scan-${cacheBucket}` },
    { whales, funding, zora, correlation, memeVelocity }
  );

  return {
    ...report,
    domain: 'alpha-scan',
  };
}

async function getAlphaScanReportWithCache(): Promise<{ report: IntelReport; cached: boolean }> {
  const now = Date.now();

  if (alphaScanCache && alphaScanCache.expiresAt > now) {
    return { report: alphaScanCache.report, cached: true };
  }

  if (alphaScanInFlight) {
    const report = await alphaScanInFlight;
    return { report, cached: true };
  }

  alphaScanInFlight = (async () => {
    const report = await generateAlphaScanReport();
    alphaScanCache = {
      report,
      expiresAt: Date.now() + ALPHA_SCAN_CACHE_TTL_MS,
    };
    return report;
  })().finally(() => {
    alphaScanInFlight = null;
  });

  const report = await alphaScanInFlight;
  return { report, cached: false };
}

// ─── Zora Intel ─────────────────────────────────────────────────────────────

router.get('/zora/intel', async (req: Request, res: Response) => {
  try {
    // Fetch all raw Zora data in parallel
    const [trending, momentum, creators] = await Promise.all([
      getZoraTrendingCoins(15),
      getAttentionMomentum(10),
      getZoraCreatorScores(10),
    ]);

    const report = await generateIntelReport(zoraIntelConfig, {
      trending,
      momentum,
      creators,
    });

    sendIntelResponse(req, res, report, {
      ...BASE_METADATA,
      endpoint: '/botindex/zora/intel',
      market: 'zora',
    });
  } catch (error) {
    logger.error({ err: error }, 'Zora intel generation failed');
    res.status(500).json({
      error: 'intel_generation_failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      metadata: BASE_METADATA,
    });
  }
});

// ─── Hyperliquid Intel ──────────────────────────────────────────────────────

router.get('/hyperliquid/intel', async (req: Request, res: Response) => {
  try {
    const fundingData = await getFundingArbOpportunities();

    const report = await generateIntelReport(hyperliquidIntelConfig, fundingData);

    sendIntelResponse(req, res, report, {
      ...BASE_METADATA,
      endpoint: '/botindex/hyperliquid/intel',
      market: 'hyperliquid',
    });
  } catch (error) {
    logger.error({ err: error }, 'Hyperliquid intel generation failed');
    res.status(500).json({
      error: 'intel_generation_failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      metadata: BASE_METADATA,
    });
  }
});

// ─── Crypto Intel ───────────────────────────────────────────────────────────

router.get('/crypto/intel', async (req: Request, res: Response) => {
  try {
    // Fetch signals from the existing /signals endpoint handler logic
    const { getBotindexTokenUniverse } = await import('../../services/botindex/engine/universe');
    const { fetchMultiplePriceSeries } = await import('../../services/botindex/engine/fetcher');
    const { generateCorrelationMatrix, getTopCorrelatedPairs } = await import('../../services/botindex/engine/matrix');

    const tokenUniverse = await getBotindexTokenUniverse(30);
    const priceSeriesMap = await fetchMultiplePriceSeries(tokenUniverse, '24h');
    const priceSeries = Array.from(priceSeriesMap.values());

    let signals: any[] = [];
    if (priceSeries.length >= 2) {
      const matrix = generateCorrelationMatrix(priceSeries, '24h');
      const top = getTopCorrelatedPairs(matrix, 15, true);
      signals = top.map((p: any, i: number) => ({
        id: `corr-${i}`,
        bot: 'correlation_engine',
        signal: p.correlation >= 0.6 ? 'buy' : p.correlation <= -0.6 ? 'sell' : 'hold',
        token: `${p.tokenA}↔${p.tokenB}`,
        confidence: Math.min(0.99, Math.abs(p.correlation)),
      }));
    }

    const report = await generateIntelReport(cryptoIntelConfig, {
      signals,
      tokens: tokenUniverse.slice(0, 20),
    });

    sendIntelResponse(req, res, report, {
      ...BASE_METADATA,
      endpoint: '/botindex/crypto/intel',
      market: 'crypto',
    });
  } catch (error) {
    logger.error({ err: error }, 'Crypto intel generation failed');
    res.status(500).json({
      error: 'intel_generation_failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      metadata: BASE_METADATA,
    });
  }
});

// ─── Doppler Intel ──────────────────────────────────────────────────────────

router.get('/doppler/intel', async (req: Request, res: Response) => {
  try {
    // Fetch Doppler launches from Zora explore (NEW_CREATORS list)
    const url = 'https://api-sdk.zora.engineering/explore?listType=NEW_CREATORS&count=15';
    const headers: Record<string, string> = { Accept: 'application/json' };
    const apiKey = process.env.ZORA_API_KEY;
    if (apiKey) headers['api-key'] = apiKey;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    let launches: any[] = [];
    try {
      const response = await fetch(url, { headers, signal: controller.signal });
      if (response.ok) {
        const payload = await response.json() as any;
        const edges = payload?.exploreList?.edges || [];
        launches = edges.map((e: any) => {
          const n = e?.node;
          return {
            name: n?.name || '',
            symbol: n?.symbol || '',
            creator: n?.creatorProfile?.handle || n?.creatorAddress || 'unknown',
            liquidity: n?.marketCap || 0,
            volume: n?.volume24h || 0,
            holders: n?.uniqueHolders || 0,
            createdAt: n?.createdAt || '',
          };
        });
      }
    } finally {
      clearTimeout(timeout);
    }

    const report = await generateIntelReport(dopplerIntelConfig, { launches });

    sendIntelResponse(req, res, report, {
      ...BASE_METADATA,
      endpoint: '/botindex/doppler/intel',
      market: 'doppler',
    });
  } catch (error) {
    logger.error({ err: error }, 'Doppler intel generation failed');
    res.status(500).json({
      error: 'intel_generation_failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      metadata: BASE_METADATA,
    });
  }
});

// ─── BotIndex Intelligence Layer ────────────────────────────────────────────

router.get('/intel/trade-signals', async (req: Request, res: Response) => {
  try {
    const analysis = await getTradeSignals();
    const verdict = buildTradeSignalsVerdict(analysis);

    if (hasFullAccess(req)) {
      res.json({
        ...analysis,
        verdict,
        isTruncated: false,
      });
      return;
    }

    const topSignal = analysis.signals[0];
    const missed = buildTradeSignalsMissed(analysis);
    const hiddenHighConfidenceCount = analysis.signals.slice(1).filter((signal) => signal.confidence > 80).length;
    const upgradeMissedCount = hiddenHighConfidenceCount > 0 ? hiddenHighConfidenceCount : missed.count;
    const upgradeQualifier = hiddenHighConfidenceCount > 0 ? 'high-confidence ' : '';
    const preview = topSignal
      ? `${analysis.signals.length} signals detected. Top: ${topSignal.asset} ${topSignal.direction}, confidence ${topSignal.confidence}% — upgrade for full analysis`
      : '0 signals detected. Upgrade for full analysis.';

    trackFunnelEvent('paywall_hit', { endpoint: req.path, plan: 'free' });
    trackFunnelEvent('upgrade_cta_shown', { endpoint: req.path });
    res.json({
      signals: topSignal
        ? [{
            asset: topSignal.asset,
            direction: topSignal.direction,
            confidence: topSignal.confidence,
            reasoning: truncateTeaserReasoning(topSignal.reasoning),
          }]
        : [],
      analyzedAt: analysis.analyzedAt,
      degraded: analysis.degraded,
      verdict,
      preview,
      isTruncated: true,
      missed,
      upgrade: {
        message: `You are missing ${upgradeMissedCount} ${upgradeQualifier}signal${upgradeMissedCount === 1 ? '' : 's'}. Upgrade to see all.`,
        register: BASIC_REGISTRATION_LINK,
      },
    });
  } catch (error) {
    logger.error({ err: error }, '[intel.trade-signals] failed');
    res.status(500).json({
      error: 'intel_trade_signals_failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.post('/intel/portfolio-risk', async (req: Request, res: Response) => {
  const positions = normalizePositionsInput((req.body as { positions?: unknown } | undefined)?.positions);
  if (!positions) {
    res.status(400).json({
      error: 'invalid_positions',
      message: 'Body must include positions: [{ asset: string, direction: \"long\"|\"short\", size_pct: number > 0 }].',
    });
    return;
  }

  try {
    const analysis = await scanPortfolioRisk(positions);
    const verdict = buildPortfolioRiskVerdict(analysis);

    if (hasFullAccess(req)) {
      res.json({
        ...analysis,
        verdict,
        isTruncated: false,
      });
      return;
    }

    const missed = buildPortfolioRiskMissed(analysis);
    const preview = `Risk score: ${analysis.overall_risk_score}/100 ${analysis.risk_level}. ${analysis.correlated_pairs.length} correlated pairs detected, ${analysis.hedge_recommendations.length} hedge recommended — upgrade for details`;

    trackFunnelEvent('paywall_hit', { endpoint: req.path, plan: 'free' });
    trackFunnelEvent('upgrade_cta_shown', { endpoint: req.path });
    res.json({
      overall_risk_score: analysis.overall_risk_score,
      risk_level: analysis.risk_level,
      analyzedAt: analysis.analyzedAt,
      degraded: analysis.degraded,
      verdict,
      preview,
      isTruncated: true,
      missed,
      upgrade: {
        message: `You are missing ${missed.count} portfolio risk details. Upgrade to see all.`,
        register: BASIC_REGISTRATION_LINK,
      },
    });
  } catch (error) {
    logger.error({ err: error }, '[intel.portfolio-risk] failed');
    res.status(500).json({
      error: 'intel_portfolio_risk_failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/intel/convergence', async (req: Request, res: Response) => {
  try {
    const analysis = await detectSignalConvergence();
    const verdict = buildConvergenceVerdict(analysis);

    if (hasFullAccess(req)) {
      res.json({
        ...analysis,
        verdict,
        isTruncated: false,
      });
      return;
    }

    const top = analysis.convergences[0];
    const missed = buildConvergenceMissed(analysis);
    const preview = top
      ? `${analysis.convergences.length} convergences detected. Strongest: ${top.asset} (${top.signal_count} signals, ${top.direction}) — upgrade for full report`
      : '0 convergences detected. Upgrade for full report.';

    trackFunnelEvent('paywall_hit', { endpoint: req.path, plan: 'free' });
    trackFunnelEvent('upgrade_cta_shown', { endpoint: req.path });
    res.json({
      convergence_count: analysis.convergences.length,
      top_asset: top?.asset ?? null,
      analyzedAt: analysis.analyzedAt,
      degraded: analysis.degraded,
      verdict,
      preview,
      isTruncated: true,
      missed,
      upgrade: {
        message: `You are missing ${missed.count} convergence setups. Upgrade to see all.`,
        register: BASIC_REGISTRATION_LINK,
      },
    });
  } catch (error) {
    logger.error({ err: error }, '[intel.convergence] failed');
    res.status(500).json({
      error: 'intel_convergence_failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/intel/launch-alpha', async (req: Request, res: Response) => {
  try {
    const analysis = await analyzeLaunchAlpha();
    const verdict = buildLaunchAlphaVerdict(analysis);

    if (hasFullAccess(req)) {
      res.json({
        ...analysis,
        verdict,
        isTruncated: false,
      });
      return;
    }

    const top = analysis.launches[0];
    const missed = buildLaunchAlphaMissed(analysis);
    const preview = top
      ? `${analysis.launches.length} launches scored. Top: ${top.token}, confidence ${top.entry_confidence} — upgrade for full rankings`
      : '0 launches scored. Upgrade for full rankings.';

    trackFunnelEvent('paywall_hit', { endpoint: req.path, plan: 'free' });
    trackFunnelEvent('upgrade_cta_shown', { endpoint: req.path });
    res.json({
      launches: top
        ? [{ token: top.token, entry_confidence: top.entry_confidence }]
        : [],
      analyzedAt: analysis.analyzedAt,
      degraded: analysis.degraded,
      verdict,
      preview,
      isTruncated: true,
      missed,
      upgrade: {
        message: `You are missing ${missed.count} launch candidates. Upgrade to see all.`,
        register: BASIC_REGISTRATION_LINK,
      },
    });
  } catch (error) {
    logger.error({ err: error }, '[intel.launch-alpha] failed');
    res.status(500).json({
      error: 'intel_launch_alpha_failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ─── Alpha Scan (Premium) ───────────────────────────────────────────────────

router.get('/alpha-scan', preventFreeApiKeyBypass, alphaScanGate, async (_req: Request, res: Response) => {
  try {
    const { report, cached } = await getAlphaScanReportWithCache();

    res.json({
      ...report,
      isTruncated: false,
      cached,
      metadata: {
        ...BASE_METADATA,
        endpoint: '/botindex/alpha-scan',
        market: 'cross-market',
        tier: 'premium',
        price: '$0.10',
        cacheTtlSeconds: 300,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Alpha Scan generation failed');
    res.status(500).json({
      error: 'alpha_scan_generation_failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      metadata: {
        ...BASE_METADATA,
        endpoint: '/botindex/alpha-scan',
        tier: 'premium',
        price: '$0.10',
      },
    });
  }
});

export default router;

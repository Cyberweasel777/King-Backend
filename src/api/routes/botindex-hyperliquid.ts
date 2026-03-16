import { Request, Response, Router } from 'express';
import { createX402Gate } from '../middleware/x402Gate';
import logger from '../../config/logger';
import { getFundingArbOpportunities } from '../../services/botindex/hyperliquid/funding-arb';
import { getHLCorrelationMatrix } from '../../services/botindex/hyperliquid/correlation';
import { getHyperliquidWhaleAlerts } from '../../services/botindex/hyperliquid/whale-alerts';
import { getLiquidationHeatmap } from '../../services/botindex/hyperliquid/liquidations';
import { ensureHip6Primed, getHip6AlertScores, getHip6FeedHistory, getHip6LaunchCandidates } from '../../services/botindex/hyperliquid/hip6';
import { buildFreeCTA } from '../../shared/response-cta';

const router = Router();

const METADATA = {
  protocol: 'x402',
  version: '1.0',
  provider: 'Renaldo Corp / BotIndex',
  market: 'hyperliquid',
} as const;

function formatUsdMillions(value: number): string {
  return (value / 1_000_000).toFixed(1);
}

function formatPercent(value: number, decimals: number = 3): string {
  return (value * 100).toFixed(decimals);
}

function buildFundingSummary(opportunities: Array<{
  symbol: string;
  hlFundingRate: number;
  binanceFundingRate: number;
}>): string {
  if (!opportunities.length) {
    return '0 funding rate divergences detected. Best opportunity: none.';
  }

  const top = opportunities[0];
  const averageRate = (top.hlFundingRate + top.binanceFundingRate) / 2;
  return `${opportunities.length} funding rate divergences detected. Best opportunity: ${top.symbol} at ${formatPercent(top.hlFundingRate)}% (exchange avg: ${formatPercent(averageRate)}%).`;
}

function buildCorrelationSummary(matrix: Record<string, Record<string, number>>): string {
  const assets = Object.keys(matrix);
  if (assets.length < 2) {
    return `${assets.length} assets in matrix. Strongest pair unavailable.`;
  }

  let strongestPair: { left: string; right: string; correlation: number } | null = null;
  for (let i = 0; i < assets.length; i += 1) {
    for (let j = i + 1; j < assets.length; j += 1) {
      const left = assets[i];
      const right = assets[j];
      const correlation = matrix[left]?.[right] ?? matrix[right]?.[left];
      if (typeof correlation !== 'number') continue;

      if (!strongestPair || Math.abs(correlation) > Math.abs(strongestPair.correlation)) {
        strongestPair = { left, right, correlation };
      }
    }
  }

  if (!strongestPair) {
    return `${assets.length} assets in matrix. Strongest pair unavailable.`;
  }

  return `${assets.length} assets in matrix. Strongest pair: ${strongestPair.left}/${strongestPair.right} (${strongestPair.correlation.toFixed(2)}).`;
}

function buildWhaleSummaryLine(data: {
  topPositions: Array<{ coin: string; side: string; positionValue: number }>;
  totalTrackedValue: number;
}): string {
  const largest = data.topPositions[0];
  if (!largest) {
    return '0 whale positions worth $0.0m detected. Largest: N/A.';
  }

  return `${data.topPositions.length} whale positions worth $${formatUsdMillions(data.totalTrackedValue)}m detected. Largest: ${largest.coin} ${largest.side} $${formatUsdMillions(largest.positionValue)}m.`;
}

router.get(
  '/hyperliquid/funding-arb',
  async (_req: Request, res: Response) => {
    try {
      const data = await getFundingArbOpportunities();
      const summary = buildFundingSummary(data.opportunities);
      const topOpp = data.opportunities[0];
      const teaser = topOpp
        ? `DeepSeek analysis: ${topOpp.symbol} rate divergence suggests ${Math.abs(topOpp.hlFundingRate) > 0.001 ? 'high-conviction' : 'moderate'} arb window. Full trade signal + risk score available with API key.`
        : undefined;
      res.json({
        ...data,
        summary,
        count: data.opportunities.length,
        timestamp: new Date().toISOString(),
        metadata: {
          ...METADATA,
          endpoint: '/botindex/hyperliquid/funding-arb',
          price: 'FREE',
        },
        ...buildFreeCTA(teaser),
      });
    } catch (error) {
      logger.error({ err: error }, 'Failed to fetch Hyperliquid funding arbitrage');
      res.status(500).json({
        error: 'hyperliquid_funding_arb_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        metadata: METADATA,
      });
    }
  }
);

router.get(
  '/hyperliquid/correlation-matrix',
  async (_req: Request, res: Response) => {
    try {
      const data = await getHLCorrelationMatrix();
      const corrSummary = buildCorrelationSummary(data.matrix);
      res.json({
        ...data,
        summary: corrSummary,
        metadata: {
          ...METADATA,
          endpoint: '/botindex/hyperliquid/correlation-matrix',
          price: 'FREE',
        },
        ...buildFreeCTA('DeepSeek convergence detector: analyzes correlation shifts + funding rates + whale flow to find multi-signal trade setups. Upgrade for full analysis.'),
      });
    } catch (error) {
      logger.error({ err: error }, 'Failed to fetch Hyperliquid correlation matrix');
      res.status(500).json({
        error: 'hyperliquid_correlation_matrix_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        metadata: METADATA,
      });
    }
  }
);

router.get(
  '/hyperliquid/liquidation-heatmap',
  async (_req: Request, res: Response) => {
    try {
      const data = await getLiquidationHeatmap();
      res.json({
        ...data,
        count: data.heatmap.length,
        timestamp: new Date().toISOString(),
        metadata: {
          ...METADATA,
          endpoint: '/botindex/hyperliquid/liquidation-heatmap',
          price: 'FREE',
        },
        ...buildFreeCTA('DeepSeek portfolio risk engine: overlays liquidation clusters with your positions to flag cascade risk. Upgrade for personalized risk scores.'),
      });
    } catch (error) {
      logger.error({ err: error }, 'Failed to fetch Hyperliquid liquidation heatmap');
      res.status(500).json({
        error: 'hyperliquid_liquidation_heatmap_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        metadata: METADATA,
      });
    }
  }
);

router.get('/hyperliquid/hip6/status', async (_req: Request, res: Response) => {
  res.json({
    status: 'active',
    protocol: 'HIP-6',
    mode: 'signal_intelligence',
    source: 'live_hyperliquid_market_data',
    endpoints: {
      feedHistory: '/api/botindex/hyperliquid/hip6/feed-history',
      alertScores: '/api/botindex/hyperliquid/hip6/alert-scores',
      launchCandidates: '/api/botindex/hyperliquid/hip6/launch-candidates',
    },
    note: 'Signal layer for HIP-6 opportunity monitoring. Not an official Hyperliquid auction feed.',
    timestamp: new Date().toISOString(),
  });
});

router.get('/hyperliquid/hip6/feed-history', async (req: Request, res: Response) => {
  try {
    await ensureHip6Primed();
    const limitRaw = Number.parseInt(String(req.query.limit ?? '24'), 10);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, limitRaw)) : 24;
    const data = getHip6FeedHistory(limit);
    res.json({
      ...data,
      count: data.history.length,
      metadata: {
        ...METADATA,
        endpoint: '/botindex/hyperliquid/hip6/feed-history',
        price: 'free',
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch HIP-6 feed history');
    res.status(500).json({
      error: 'hyperliquid_hip6_feed_history_failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      metadata: METADATA,
    });
  }
});

router.get('/hyperliquid/hip6/alert-scores', async (req: Request, res: Response) => {
  try {
    await ensureHip6Primed();
    const limitRaw = Number.parseInt(String(req.query.limit ?? '20'), 10);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, limitRaw)) : 20;
    const data = getHip6AlertScores(limit);
    res.json({
      ...data,
      count: data.alerts.length,
      metadata: {
        ...METADATA,
        endpoint: '/botindex/hyperliquid/hip6/alert-scores',
        price: 'free',
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch HIP-6 alert scores');
    res.status(500).json({
      error: 'hyperliquid_hip6_alert_scores_failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      metadata: METADATA,
    });
  }
});

router.get(
  '/hyperliquid/hip6/launch-candidates',
  createX402Gate({ price: '$0.01', description: 'HIP-6 launch candidate ranking from live HL market data (0.01 USDC)' }),
  async (req: Request, res: Response) => {
    try {
      const limitRaw = Number.parseInt(String(req.query.limit ?? '20'), 10);
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, limitRaw)) : 20;

      const data = await getHip6LaunchCandidates(limit);
      res.json({
        ...data,
        count: data.candidates.length,
        metadata: {
          ...METADATA,
          endpoint: '/botindex/hyperliquid/hip6/launch-candidates',
          price: '$0.01',
        },
      });
    } catch (error) {
      logger.error({ err: error }, 'Failed to fetch HIP-6 launch candidates');
      res.status(500).json({
        error: 'hyperliquid_hip6_launch_candidates_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        metadata: METADATA,
      });
    }
  }
);

// --- Whale Alerts ---

router.get('/hyperliquid/whale-alerts', async (_req: Request, res: Response) => {
  try {
    const data = await getHyperliquidWhaleAlerts();
    const whaleSummaryLine = buildWhaleSummaryLine(data);
    const topWhale = data.topPositions[0];
    const whaleTeaser = topWhale
      ? `DeepSeek signal: ${topWhale.coin} has $${formatUsdMillions(data.totalTrackedValue)}m in whale exposure. Trade signal + confidence score available with API key.`
      : undefined;
    res.json({
      summary: {
        oneLiner: whaleSummaryLine,
        totalTrackedValue: data.totalTrackedValue,
        whalesTracked: data.whalesTracked,
        topPositions: data.topPositions.slice(0, 3).map(p => ({
          coin: p.coin,
          side: p.side,
          positionValue: p.positionValue,
          leverage: p.leverage,
        })),
        recentTradeCount: data.recentLargeTrades.length,
      },
      summaryText: whaleSummaryLine,
      upgrade: 'Full whale data is now free. GET /api/botindex/hyperliquid/whale-alerts/full',
      timestamp: data.timestamp,
      metadata: {
        ...METADATA,
        endpoint: '/botindex/hyperliquid/whale-alerts',
        price: 'free (summary)',
      },
      ...buildFreeCTA(whaleTeaser),
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch Hyperliquid whale alerts');
    res.status(500).json({
      error: 'hyperliquid_whale_alerts_failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      metadata: METADATA,
    });
  }
});

router.get(
  '/hyperliquid/whale-alerts/full',
  async (_req: Request, res: Response) => {
    try {
      const data = await getHyperliquidWhaleAlerts();
      res.json({
        ...data,
        summary: data.summary ?? buildWhaleSummaryLine(data),
        metadata: {
          ...METADATA,
          endpoint: '/botindex/hyperliquid/whale-alerts/full',
          price: 'FREE',
        },
      });
    } catch (error) {
      logger.error({ err: error }, 'Failed to fetch Hyperliquid whale alerts (full)');
      res.status(500).json({
        error: 'hyperliquid_whale_alerts_full_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        metadata: METADATA,
      });
    }
  }
);

export default router;

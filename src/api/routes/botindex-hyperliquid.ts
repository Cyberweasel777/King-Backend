import { Request, Response, Router } from 'express';
import { createX402Gate } from '../middleware/x402Gate';
import logger from '../../config/logger';
import { getFundingArbOpportunities } from '../../services/botindex/hyperliquid/funding-arb';
import { getHLCorrelationMatrix } from '../../services/botindex/hyperliquid/correlation';
import { getHyperliquidWhaleAlerts } from '../../services/botindex/hyperliquid/whale-alerts';
import { getLiquidationHeatmap } from '../../services/botindex/hyperliquid/liquidations';
import { ensureHip6Primed, getHip6AlertScores, getHip6FeedHistory, getHip6LaunchCandidates } from '../../services/botindex/hyperliquid/hip6';

const router = Router();

const METADATA = {
  protocol: 'x402',
  version: '1.0',
  provider: 'Renaldo Corp / BotIndex',
  market: 'hyperliquid',
} as const;

router.get(
  '/hyperliquid/funding-arb',
  createX402Gate({ price: '$0.01', description: 'Hyperliquid vs Binance funding arbitrage (0.01 USDC)' }),
  async (_req: Request, res: Response) => {
    try {
      const data = await getFundingArbOpportunities();
      res.json({
        ...data,
        count: data.opportunities.length,
        timestamp: new Date().toISOString(),
        metadata: {
          ...METADATA,
          endpoint: '/botindex/hyperliquid/funding-arb',
          price: '$0.01',
        },
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
  createX402Gate({ price: '$0.01', description: 'Hyperliquid perp cross-market correlation matrix (0.01 USDC)' }),
  async (_req: Request, res: Response) => {
    try {
      const data = await getHLCorrelationMatrix();
      res.json({
        ...data,
        metadata: {
          ...METADATA,
          endpoint: '/botindex/hyperliquid/correlation-matrix',
          price: '$0.01',
        },
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
  createX402Gate({ price: '$0.01', description: 'Hyperliquid liquidation heatmap (0.01 USDC)' }),
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
          price: '$0.01',
        },
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
    res.json({
      summary: {
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
      upgrade: 'Full whale data requires API key or x402 payment. GET /api/botindex/hyperliquid/whale-alerts/full',
      timestamp: data.timestamp,
      metadata: {
        ...METADATA,
        endpoint: '/botindex/hyperliquid/whale-alerts',
        price: 'free (summary)',
      },
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
  createX402Gate({ price: '$0.05', description: 'Full Hyperliquid whale positions + recent large trades (0.05 USDC)' }),
  async (_req: Request, res: Response) => {
    try {
      const data = await getHyperliquidWhaleAlerts();
      res.json({
        ...data,
        metadata: {
          ...METADATA,
          endpoint: '/botindex/hyperliquid/whale-alerts/full',
          price: '$0.05',
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

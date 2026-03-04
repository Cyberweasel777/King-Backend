import { Request, Response, Router } from 'express';
import { createX402Gate } from '../middleware/x402Gate';
import logger from '../../config/logger';
import { getFundingArbOpportunities } from '../../services/botindex/hyperliquid/funding-arb';
import { getHLCorrelationMatrix } from '../../services/botindex/hyperliquid/correlation';
import { getLiquidationHeatmap } from '../../services/botindex/hyperliquid/liquidations';

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

export default router;

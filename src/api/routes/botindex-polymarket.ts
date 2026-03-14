import { Request, Response, Router } from 'express';
import { createX402Gate } from '../middleware/x402Gate';
import logger from '../../config/logger';
import {
  getPolymarketFomcMarkets,
  getPolymarketMicroMarkets,
  getPolymarketMicroMarketsTop,
  getPolymarketWhaleTrades,
  getPolymarketWhaleTradesLatest,
} from '../../services/botindex/polymarket/client';

const router = Router();

const METADATA = {
  protocol: 'x402',
  version: '1.0',
  provider: 'Renaldo Corp / BotIndex',
  market: 'polymarket',
} as const;

router.get('/polymarket/fomc', async (_req: Request, res: Response) => {
  try {
    const markets = await getPolymarketFomcMarkets();
    res.json(markets);
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch Polymarket FOMC markets');
    res.status(500).json({
      error: 'polymarket_fomc_failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      metadata: METADATA,
    });
  }
});

router.get(
  '/polymarket/micro-markets',
  createX402Gate({ price: '$0.01', description: 'Polymarket micro-markets ending within 2 hours (0.01 USDC)' }),
  async (_req: Request, res: Response) => {
    try {
      const markets = await getPolymarketMicroMarkets();
      res.json(markets);
    } catch (error) {
      logger.error({ err: error }, 'Failed to fetch Polymarket micro-markets');
      res.status(500).json({
        error: 'polymarket_micro_markets_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        metadata: METADATA,
      });
    }
  }
);

router.get('/polymarket/micro-markets/top', async (_req: Request, res: Response) => {
  try {
    const markets = await getPolymarketMicroMarketsTop(3);
    res.json(markets);
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch Polymarket micro-markets lead magnet');
    res.status(500).json({
      error: 'polymarket_micro_markets_top_failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      metadata: METADATA,
    });
  }
});

router.get(
  '/polymarket/whale-trades',
  createX402Gate({ price: '$0.02', description: 'Polymarket whale trades above $10K notional (0.02 USDC)' }),
  async (_req: Request, res: Response) => {
    try {
      const trades = await getPolymarketWhaleTrades();
      res.json(trades);
    } catch (error) {
      logger.error({ err: error }, 'Failed to fetch Polymarket whale trades');
      res.status(500).json({
        error: 'polymarket_whale_trades_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        metadata: METADATA,
      });
    }
  }
);

router.get('/polymarket/whale-trades/latest', async (_req: Request, res: Response) => {
  try {
    const trades = await getPolymarketWhaleTradesLatest(5);
    res.json(trades);
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch Polymarket whale trades lead magnet');
    res.status(500).json({
      error: 'polymarket_whale_trades_latest_failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      metadata: METADATA,
    });
  }
});

export default router;

import { Request, Response, Router } from 'express';
import logger from '../../config/logger';
import { getZoraTrendingCoins } from '../../services/botindex/zora/trending';
import { getZoraCreatorScores } from '../../services/botindex/zora/creator-scores';
import { getAttentionMomentum } from '../../services/botindex/zora/attention';

const router = Router();

const METADATA = {
  protocol: 'x402',
  version: '1.0',
  provider: 'Renaldo Corp / BotIndex',
  market: 'zora',
} as const;

function parseLimit(value: unknown, defaultValue: number = 10, maxValue: number = 50): number | null {
  if (value === undefined) return defaultValue;

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return null;
  }

  return Math.min(parsed, maxValue);
}

router.get('/zora/trending-coins', async (req: Request, res: Response) => {
  const limit = parseLimit(req.query.limit);
  if (limit === null) {
    res.status(400).json({
      error: 'invalid_limit',
      message: 'Query parameter limit must be a positive integer',
      metadata: METADATA,
    });
    return;
  }

  try {
    const data = await getZoraTrendingCoins(limit);
    res.json({
      ...data,
      count: data.coins.length,
      timestamp: new Date().toISOString(),
      metadata: {
        ...METADATA,
        endpoint: '/botindex/zora/trending-coins',
        price: 'FREE',
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch Zora trending coins');
    res.status(500).json({
      error: 'zora_trending_fetch_failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      metadata: METADATA,
    });
  }
});

router.get(
  '/zora/creator-scores',
  async (req: Request, res: Response) => {
    const limit = parseLimit(req.query.limit);
    if (limit === null) {
      res.status(400).json({
        error: 'invalid_limit',
        message: 'Query parameter limit must be a positive integer',
        metadata: METADATA,
      });
      return;
    }

    try {
      const data = await getZoraCreatorScores(limit);
      res.json({
        ...data,
        count: data.creators.length,
        timestamp: new Date().toISOString(),
        metadata: {
          ...METADATA,
          endpoint: '/botindex/zora/creator-scores',
          price: 'FREE',
        },
      });
    } catch (error) {
      logger.error({ err: error }, 'Failed to fetch Zora creator scores');
      res.status(500).json({
        error: 'zora_creator_scores_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        metadata: METADATA,
      });
    }
  }
);

router.get(
  '/zora/attention-momentum',
  async (req: Request, res: Response) => {
    const limit = parseLimit(req.query.limit);
    if (limit === null) {
      res.status(400).json({
        error: 'invalid_limit',
        message: 'Query parameter limit must be a positive integer',
        metadata: METADATA,
      });
      return;
    }

    try {
      const data = await getAttentionMomentum(limit);
      res.json({
        ...data,
        count: data.trends.length,
        timestamp: new Date().toISOString(),
        metadata: {
          ...METADATA,
          endpoint: '/botindex/zora/attention-momentum',
          price: 'FREE',
        },
      });
    } catch (error) {
      logger.error({ err: error }, 'Failed to fetch Zora attention momentum');
      res.status(500).json({
        error: 'zora_attention_momentum_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        metadata: METADATA,
      });
    }
  }
);

export default router;

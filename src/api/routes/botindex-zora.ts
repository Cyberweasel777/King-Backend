import { Request, Response, Router } from 'express';
import logger from '../../config/logger';
import { getZoraTrendingCoins } from '../../services/botindex/zora/trending';
import { getZoraCreatorScores } from '../../services/botindex/zora/creator-scores';
import { getAttentionMomentum } from '../../services/botindex/zora/attention';
import { buildFreeCTA } from '../../shared/response-cta';
import { softGate } from '../middleware/softGate';

const router = Router();

const METADATA = {
  protocol: 'x402',
  version: '1.0',
  provider: 'Renaldo Corp / BotIndex',
  market: 'zora',
} as const;

function buildTrendingSummary(coins: Array<{ name: string; volume24h: number }>): string {
  const top = coins[0];
  if (!top) {
    return '0 trending tokens. Top mover: none with 0 volume attention score.';
  }

  return `${coins.length} trending tokens. Top mover: ${top.name} with ${top.volume24h.toFixed(2)} volume attention score.`;
}

function parseLimit(value: unknown, defaultValue: number = 10, maxValue: number = 50): number | null {
  if (value === undefined) return defaultValue;

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return null;
  }

  return Math.min(parsed, maxValue);
}

router.get('/zora/trending-coins', softGate(), async (req: Request, res: Response) => {
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
    const topCoin = data.coins[0];
    const zoraTeaser = topCoin
      ? `DeepSeek launch alpha: ${topCoin.name} showing ${topCoin.volume24h > 1000 ? 'breakout' : 'early'} attention signals. Entry confidence + risk score available with API key.`
      : undefined;
    res.json({
      ...data,
      summary: buildTrendingSummary(data.coins),
      count: data.coins.length,
      timestamp: new Date().toISOString(),
      metadata: {
        ...METADATA,
        endpoint: '/botindex/zora/trending-coins',
        price: 'FREE',
      },
      ...buildFreeCTA(zoraTeaser),
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
        ...buildFreeCTA('DeepSeek launch alpha: scores creator track records + token momentum to flag high-conviction early entries. Upgrade for full analysis.'),
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
        ...buildFreeCTA('DeepSeek convergence detector: cross-references attention spikes with on-chain flows to find breakout candidates before the crowd. Upgrade for signals.'),
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

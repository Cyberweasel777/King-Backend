import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { createX402Gate } from '../middleware/x402Gate';
import { freeTrialGate, skipIfFreeTrial } from '../middleware/freeTrial';
import { fetchMultiplePriceSeries } from '../../services/botindex/engine/fetcher';
import { getBotindexTokenUniverse } from '../../services/botindex/engine/universe';
import { identifyMarketLeaders, TIME_WINDOWS } from '../../services/botindex/engine/matrix';

const router = Router();

const querySchema = z.object({
  window: z.enum(['1h', '24h', '7d', '30d']).default('24h'),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  minScore: z.coerce.number().int().min(0).max(100).default(0),
  tokens: z.string().optional(),
});

router.get(
  '/correlation-leaders',
  freeTrialGate(),
  skipIfFreeTrial(createX402Gate({
    price: '$0.01',
    description: 'BotIndex correlation leaders (x402 test route)',
  })),
  async (req: Request, res: Response) => {
    try {
      const parsedQuery = querySchema.safeParse(req.query);
      if (!parsedQuery.success) {
        res.status(400).json({
          error: 'invalid_query',
          message: parsedQuery.error.issues[0]?.message || 'Invalid query parameters',
        });
        return;
      }

      const { window, limit, minScore, tokens } = parsedQuery.data;
      if (!TIME_WINDOWS[window]) {
        res.status(400).json({
          error: 'Invalid window. Use: 1h, 24h, 7d, 30d'
        });
        return;
      }

      const tokenUniverse = tokens
        ? tokens
            .split(',')
            .map((t) => t.trim())
            .filter((t) => t.length > 0)
        : await getBotindexTokenUniverse(30);

      const priceSeriesMap = await fetchMultiplePriceSeries(tokenUniverse, window);
      const priceSeries = Array.from(priceSeriesMap.values());

      if (priceSeries.length < 2) {
        res.status(400).json({
          error: 'Insufficient price data'
        });
        return;
      }

      const leaders = identifyMarketLeaders(priceSeries)
        .filter((leader) => leader.leadScore >= minScore)
        .slice(0, limit);

      res.json({
        leaders: leaders.map((leader) => ({
          token: leader.token,
          leadScore: leader.leadScore,
          avgLeadTime: leader.avgLeadTime,
          numLedTokens: leader.numLedTokens,
          causalityStrength: leader.causalityStrength,
        })),
        calculatedAt: new Date().toISOString(),
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to identify market leaders',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

export default router;

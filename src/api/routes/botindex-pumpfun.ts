import { Request, Response, Router } from 'express';
import { createX402Gate } from '../middleware/x402Gate';
import logger from '../../config/logger';
import { getGraduatingTokens, getRecentGraduations, getRugScore } from '../../services/botindex/pumpfun/client';

const router = Router();

router.get(
  '/pumpfun/graduating',
  createX402Gate({ price: '$0.01', description: 'Pump.fun tokens approaching bonding curve graduation (>80% progress)' }),
  async (_req: Request, res: Response) => {
    try {
      const tokens = await getGraduatingTokens();
      res.json({
        count: tokens.length,
        tokens,
        source: process.env.PUMPFUN_LIVE === 'true' ? 'live' : 'stub',
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      logger.error({ err }, '[pumpfun] Failed to fetch graduating tokens');
      res.status(502).json({
        error: 'pumpfun_graduating_failed',
        message: err instanceof Error ? err.message : 'Failed to fetch graduating tokens',
      });
    }
  }
);

router.get(
  '/pumpfun/graduated',
  createX402Gate({ price: '$0.02', description: 'Recently graduated Pump.fun tokens with rug risk scores' }),
  async (req: Request, res: Response) => {
    const limitParam = req.query.limit;
    let limit = 10;
    if (limitParam !== undefined) {
      const parsed = Number.parseInt(String(limitParam), 10);
      if (!Number.isFinite(parsed) || parsed < 1) {
        res.status(400).json({ error: 'invalid_limit', message: 'limit must be a positive integer' });
        return;
      }
      limit = Math.min(parsed, 50);
    }

    try {
      const graduations = await getRecentGraduations(limit);
      res.json({
        count: graduations.length,
        graduations,
        source: process.env.PUMPFUN_LIVE === 'true' ? 'live' : 'stub',
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      logger.error({ err }, '[pumpfun] Failed to fetch graduated tokens');
      res.status(502).json({
        error: 'pumpfun_graduated_failed',
        message: err instanceof Error ? err.message : 'Failed to fetch graduated tokens',
      });
    }
  }
);

router.get(
  '/pumpfun/rug-score/:mint',
  createX402Gate({ price: '$0.02', description: 'Detailed rug risk analysis for a specific Pump.fun token' }),
  async (req: Request, res: Response) => {
    const { mint } = req.params;
    if (!mint || mint.length < 32 || mint.length > 50) {
      res.status(400).json({
        error: 'invalid_mint',
        message: 'Provide a valid Solana mint address (32-44 characters)',
      });
      return;
    }

    try {
      const score = await getRugScore(mint);
      res.json({
        ...score,
        source: process.env.PUMPFUN_LIVE === 'true' ? 'live' : 'stub',
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      logger.error({ err, mint }, '[pumpfun] Failed to compute rug score');
      res.status(502).json({
        error: 'pumpfun_rug_score_failed',
        message: err instanceof Error ? err.message : 'Failed to compute rug score',
      });
    }
  }
);

export default router;

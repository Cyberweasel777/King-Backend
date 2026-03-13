import { Request, Response, Router } from 'express';
import logger from '../../config/logger';
import { optionalApiKey } from '../middleware/apiKeyAuth';
import { createX402Gate } from '../middleware/x402Gate';
import { MemeVelocityChain, scanMemeTokenVelocity } from '../../services/botindex/meme/velocityScanner';

const router = Router();

function parseChain(value: unknown): MemeVelocityChain | null {
  if (value === undefined) return null;
  const normalized = String(value).toLowerCase().trim();
  if (normalized === 'base') return 'base';
  if (normalized === 'solana') return 'solana';
  if (normalized === 'eth' || normalized === 'ethereum') return 'ethereum';
  return null;
}

function parsePositiveInt(value: unknown, fallback: number, max: number): number | null {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return null;
  return Math.min(parsed, max);
}

router.get(
  '/meme/velocity',
  optionalApiKey,
  createX402Gate({
    price: '$0.02',
    description: 'Cross-platform meme token velocity scanner',
  }),
  async (req: Request, res: Response) => {
    const chain = parseChain(req.query.chain);
    if (req.query.chain !== undefined && !chain) {
      res.status(400).json({ error: 'invalid_chain', message: 'chain must be one of: base, solana, eth' });
      return;
    }

    const minScore = parsePositiveInt(req.query.min_score, 30, 100);
    if (minScore === null) {
      res.status(400).json({ error: 'invalid_min_score', message: 'min_score must be a positive integer (1-100)' });
      return;
    }

    const limit = parsePositiveInt(req.query.limit, 200, 500);
    if (limit === null) {
      res.status(400).json({ error: 'invalid_limit', message: 'limit must be a positive integer' });
      return;
    }

    try {
      const scan = await scanMemeTokenVelocity();

      const tokens = scan.tokens
        .filter((token) => token.velocityScore > minScore)
        .filter((token) => !chain || token.chain === chain)
        .slice(0, limit);

      res.json({
        count: tokens.length,
        filters: {
          chain: chain || 'all',
          min_score: minScore,
          limit,
        },
        tokens,
        fetchedAt: scan.fetchedAt,
        cached: scan.cached,
        sources: scan.sources,
      });
    } catch (error) {
      logger.error({ err: error }, '[meme.velocity] failed');
      res.status(502).json({
        error: 'meme_velocity_scan_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

router.get('/meme/velocity/top', async (_req: Request, res: Response) => {
  try {
    const scan = await scanMemeTokenVelocity();

    const tokens = scan.tokens
      .filter((token) => token.velocityScore > 30)
      .slice(0, 5);

    res.json({
      count: tokens.length,
      tokens,
      fetchedAt: scan.fetchedAt,
      cached: scan.cached,
      sources: scan.sources,
    });
  } catch (error) {
    logger.error({ err: error }, '[meme.velocity.top] failed');
    res.status(502).json({
      error: 'meme_velocity_top_failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;

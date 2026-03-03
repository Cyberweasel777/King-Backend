/**
 * BotIndex Genesis Routes — Metaplex Genesis launch data from Solana
 * Proxies to GradSniper's Genesis endpoints
 */

import { Request, Response, Router } from 'express';
import { createX402Gate } from '../middleware/x402Gate';

const router = Router();

const GRADSNIPER_URL = process.env.GRADSNIPER_URL || 'https://gradsniper.fly.dev';

// GET /v1/solana/launches — All Genesis launches on Solana
router.get(
  '/solana/launches',
  createX402Gate({ price: '$0.02', description: 'Metaplex Genesis token launches on Solana' }),
  async (_req: Request, res: Response) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(`${GRADSNIPER_URL}/api/genesis/launches`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      }).finally(() => clearTimeout(timeout));

      if (response.ok) {
        const data = await response.json();
        res.json({
          ...(data as object),
          proxied: true,
          metadata: { protocol: 'x402', endpoint: '/v1/solana/launches' },
        });
      } else {
        throw new Error(`GradSniper Genesis returned ${response.status}`);
      }
    } catch (error) {
      res.json({
        launches: [],
        source: 'metaplex_genesis',
        chain: 'solana',
        status: 'unavailable',
        error: error instanceof Error ? error.message : 'GradSniper Genesis unreachable',
        updatedAt: new Date().toISOString(),
        metadata: { protocol: 'x402', endpoint: '/v1/solana/launches' },
      });
    }
  }
);

// GET /v1/solana/active — Active Genesis launches only
router.get(
  '/solana/active',
  createX402Gate({ price: '$0.02', description: 'Active Metaplex Genesis launches on Solana' }),
  async (_req: Request, res: Response) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(`${GRADSNIPER_URL}/api/genesis/active`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      }).finally(() => clearTimeout(timeout));

      if (response.ok) {
        const data = await response.json();
        res.json({
          ...(data as object),
          proxied: true,
          metadata: { protocol: 'x402', endpoint: '/v1/solana/active' },
        });
      } else {
        throw new Error(`GradSniper Genesis returned ${response.status}`);
      }
    } catch (error) {
      res.json({
        launches: [],
        source: 'metaplex_genesis',
        chain: 'solana',
        status: 'unavailable',
        error: error instanceof Error ? error.message : 'GradSniper Genesis unreachable',
        updatedAt: new Date().toISOString(),
        metadata: { protocol: 'x402', endpoint: '/v1/solana/active' },
      });
    }
  }
);

export default router;

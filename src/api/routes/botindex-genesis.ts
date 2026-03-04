/**
 * BotIndex Genesis Routes — Metaplex Genesis launch data from Solana
 * Reads on-chain launch data from the Metaplex Genesis program
 */

import { Request, Response, Router } from 'express';
import { createX402Gate } from '../middleware/x402Gate';
import { getActiveLaunches, getAllLaunches } from '../../services/genesis-fetcher';

const router = Router();

// GET /v1/solana/launches — All Genesis launches on Solana
router.get(
  '/solana/launches',
  createX402Gate({ price: '$0.02', description: 'Metaplex Genesis token launches on Solana' }),
  async (_req: Request, res: Response) => {
    try {
      const data = await getAllLaunches();
      res.json({
        launches: data.launches,
        source: 'metaplex_genesis_onchain',
        chain: 'solana',
        count: data.launches.length,
        updatedAt: data.updatedAt,
        ...(data.stale ? { stale: true } : {}),
        ...(data.error ? { error: data.error } : {}),
        metadata: { protocol: 'x402', endpoint: '/v1/solana/launches' },
      });
    } catch (error) {
      res.json({
        launches: [],
        source: 'metaplex_genesis_onchain',
        chain: 'solana',
        count: 0,
        stale: true,
        error: error instanceof Error ? error.message : 'Metaplex Genesis fetch failed',
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
      const data = await getActiveLaunches();
      res.json({
        launches: data.launches,
        source: 'metaplex_genesis_onchain',
        chain: 'solana',
        count: data.launches.length,
        updatedAt: data.updatedAt,
        ...(data.stale ? { stale: true } : {}),
        ...(data.error ? { error: data.error } : {}),
        metadata: { protocol: 'x402', endpoint: '/v1/solana/active' },
      });
    } catch (error) {
      res.json({
        launches: [],
        source: 'metaplex_genesis_onchain',
        chain: 'solana',
        count: 0,
        stale: true,
        error: error instanceof Error ? error.message : 'Metaplex Genesis fetch failed',
        updatedAt: new Date().toISOString(),
        metadata: { protocol: 'x402', endpoint: '/v1/solana/active' },
      });
    }
  }
);

export default router;

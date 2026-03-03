/**
 * BotIndex Commerce Routes — Agentic commerce comparison intelligence
 * Neutral layer across ACP (OpenAI+Stripe), UCP (Google), and x402 (Coinbase)
 */

import { Request, Response, Router } from 'express';
import { createX402Gate } from '../middleware/x402Gate';
import { compareOffers, getProtocolDirectory } from '../../services/commerce/comparator';

const router = Router();

// GET /v1/commerce/compare — Compare merchant offers across protocols
router.get(
  '/commerce/compare',
  createX402Gate({ price: '$0.05', description: 'Cross-protocol merchant comparison for agentic purchases' }),
  async (req: Request, res: Response) => {
    try {
      const query = String(req.query.q ?? req.query.query ?? '');
      if (!query) {
        res.status(400).json({
          error: 'missing_query',
          message: 'Provide ?q=<product query> to search merchant offers',
        });
        return;
      }

      const result = await compareOffers({
        query,
        category: req.query.category ? String(req.query.category) : undefined,
        maxPrice: req.query.maxPrice ? Number(req.query.maxPrice) : undefined,
        preferredProtocol: req.query.protocol ? String(req.query.protocol) : undefined,
        limit: req.query.limit ? Math.min(Number(req.query.limit), 50) : 10,
      });

      res.json({
        ...result,
        source: 'botindex_commerce',
        metadata: { protocol: 'x402', endpoint: '/v1/commerce/compare' },
      });
    } catch (error) {
      res.status(500).json({
        error: 'comparison_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

// GET /v1/commerce/protocols — Protocol directory with fees and merchant counts
router.get(
  '/commerce/protocols',
  createX402Gate({ price: '$0.01', description: 'Agentic commerce protocol directory (ACP, UCP, x402)' }),
  async (_req: Request, res: Response) => {
    try {
      const directory = await getProtocolDirectory();
      res.json({
        ...directory,
        source: 'botindex_commerce',
        metadata: { protocol: 'x402', endpoint: '/v1/commerce/protocols' },
      });
    } catch (error) {
      res.status(500).json({
        error: 'directory_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

export default router;

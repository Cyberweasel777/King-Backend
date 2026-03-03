/**
 * BotIndex Sports Routes — Unified sports data surface
 * Aggregates SpreadHunter, RosterRadar, and ArbWatch data
 */

import { Request, Response, Router } from 'express';
import { createX402Gate } from '../middleware/x402Gate';
import { getOddsSnapshot, getLineMovements, getTopProps } from '../../services/sports/oddsProvider';
import { getCorrelations, getLineupOptimizer } from '../../services/sports/rosterProvider';
import { runArbScanner, type ArbScannerResponse } from '../../services/arbwatch/scanner';

const router = Router();

// GET /v1/sports/odds — Live odds snapshot
router.get(
  '/sports/odds',
  createX402Gate({ price: '$0.02', description: 'Live sports odds snapshot' }),
  async (_req: Request, res: Response) => {
    try {
      const data = await getOddsSnapshot();
      res.json({
        ...data,
        source: 'spreadhunter',
        metadata: { protocol: 'x402', endpoint: '/v1/sports/odds' },
      });
    } catch (error) {
      res.status(500).json({
        error: 'odds_fetch_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

// GET /v1/sports/lines — Line movement tracker
router.get(
  '/sports/lines',
  createX402Gate({ price: '$0.02', description: 'Sports line movements with sharp action flags' }),
  async (_req: Request, res: Response) => {
    try {
      const data = await getLineMovements();
      res.json({
        ...data,
        source: 'spreadhunter',
        metadata: { protocol: 'x402', endpoint: '/v1/sports/lines' },
      });
    } catch (error) {
      res.status(500).json({
        error: 'lines_fetch_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

// GET /v1/sports/props — Prop bet movements
router.get(
  '/sports/props',
  createX402Gate({ price: '$0.02', description: 'Top prop bet movements with confidence scores' }),
  async (_req: Request, res: Response) => {
    try {
      const data = await getTopProps();
      res.json({
        ...data,
        source: 'spreadhunter',
        metadata: { protocol: 'x402', endpoint: '/v1/sports/props' },
      });
    } catch (error) {
      res.status(500).json({
        error: 'props_fetch_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

// GET /v1/sports/correlations — Player/team correlations
router.get(
  '/sports/correlations',
  createX402Gate({ price: '$0.05', description: 'Player correlation matrix for DFS and betting' }),
  async (_req: Request, res: Response) => {
    try {
      const data = await getCorrelations();
      res.json({
        ...data,
        source: 'rosterradar',
        metadata: { protocol: 'x402', endpoint: '/v1/sports/correlations' },
      });
    } catch (error) {
      res.status(500).json({
        error: 'correlations_fetch_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

// GET /v1/sports/optimizer — DFS lineup optimizer
router.get(
  '/sports/optimizer',
  createX402Gate({ price: '$0.10', description: 'Correlation-adjusted DFS lineup optimizer' }),
  async (_req: Request, res: Response) => {
    try {
      const data = await getLineupOptimizer();
      res.json({
        ...data,
        source: 'rosterradar',
        metadata: { protocol: 'x402', endpoint: '/v1/sports/optimizer' },
      });
    } catch (error) {
      res.status(500).json({
        error: 'optimizer_fetch_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

// GET /v1/sports/arb — Cross-platform arbitrage scanner
router.get(
  '/sports/arb',
  createX402Gate({ price: '$0.05', description: 'Cross-platform prediction/sportsbook arbitrage scanner' }),
  async (req: Request, res: Response) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 10, 50);
      const minEdge = Number(req.query.minEdge) || 0;
      const result: ArbScannerResponse = await runArbScanner({
        limit,
        minEdgePct: minEdge,
        maxPerEvent: 3,
      });
      res.json({
        ...result,
        source: 'arbwatch',
        metadata: { protocol: 'x402', endpoint: '/v1/sports/arb' },
      });
    } catch (error) {
      res.status(500).json({
        error: 'arb_scan_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

export default router;

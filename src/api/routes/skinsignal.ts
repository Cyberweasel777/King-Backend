/**
 * SkinSignal API Routes — King Backend
 * CS2 skin arbitrage detection across Steam, Buff163, and Skinport
 *
 * Endpoints:
 *   GET /api/skinsignal/health
 *   GET /api/skinsignal/markets
 *   GET /api/skinsignal/skins/popular
 *   GET /api/skinsignal/opportunities
 *   GET /api/skinsignal/scan?skin=<market_hash_name>
 */

import { Router, Request, Response } from 'express';
import {
  getOpportunities,
  scanSkin,
  getMarkets,
  getHotSkins,
  bustCache,
} from '../../services/skinsignal';

const router = Router();

// ============================================================================
// HEALTH CHECK
// ============================================================================
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    app: 'skinsignal',
    status: 'ok',
    markets: getMarkets(),
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// MARKETS
// GET /api/skinsignal/markets
// Returns list of supported CS2 marketplaces
// ============================================================================
router.get('/markets', (_req: Request, res: Response) => {
  res.json({
    markets: getMarkets(),
    fees: {
      steam: '13%',
      buff163: '2.5%',
      skinport: '12%',
      csfloat: '2%',
    },
    message: 'OK',
  });
});

// ============================================================================
// POPULAR SKINS
// GET /api/skinsignal/skins/popular
// Returns the curated hot-skin watchlist
// ============================================================================
router.get('/skins/popular', (_req: Request, res: Response) => {
  res.json({ skins: getHotSkins() });
});

// ============================================================================
// OPPORTUNITIES
// GET /api/skinsignal/opportunities
// Returns arbitrage opportunities for the hot-skin list (cached 5 min)
//
// Query params:
//   ?limit=<n>             — max results (default 10, max 50)
//   ?minSpread=<pct>       — min net spread % (default 5)
//   ?deepseek=true|false   — enable AI analysis (default true)
//   ?debug=true            — include cache & error metadata
// ============================================================================
router.get('/opportunities', async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? '10'), 10) || 10, 50);
  const minNetSpreadPct = parseFloat(String(req.query.minSpread ?? '5')) || 5;
  const useDeepSeek = String(req.query.deepseek ?? 'true') !== 'false';
  const debug = String(req.query.debug ?? 'false') === 'true';

  try {
    const { opportunities, meta } = await getOpportunities({
      limit,
      minNetSpreadPct,
      useDeepSeek,
      debug,
    });

    res.json({ opportunities, meta });
  } catch (err) {
    // Best-effort: never 500 on this endpoint
    res.json({
      opportunities: [],
      meta: {
        markets: getMarkets(),
        scrapedSkins: 0,
        scrapedAt: new Date().toISOString(),
        minNetSpreadPct,
        useDeepSeek,
        limit,
        errors: [(err as Error)?.message ?? String(err)],
      },
    });
  }
});

// ============================================================================
// ON-DEMAND SCAN
// GET /api/skinsignal/scan?skin=<market_hash_name>
// Scrapes a specific skin across all markets in real-time (not cached)
//
// Example: GET /api/skinsignal/scan?skin=AK-47%20%7C%20Redline%20(Field-Tested)
// ============================================================================
router.get('/scan', async (req: Request, res: Response) => {
  const skinName = String(req.query.skin ?? '').trim();

  if (!skinName) {
    res.status(400).json({
      error: 'Missing ?skin= parameter',
      example: '/api/skinsignal/scan?skin=AK-47%20%7C%20Redline%20(Field-Tested)',
    });
    return;
  }

  const useDeepSeek = String(req.query.deepseek ?? 'true') !== 'false';
  const minNetSpreadPct = parseFloat(String(req.query.minSpread ?? '0')) || 0;

  try {
    const result = await scanSkin(skinName, { useDeepSeek, minNetSpreadPct });
    res.json(result);
  } catch (err) {
    res.status(500).json({
      skinName,
      opportunities: [],
      errors: [(err as Error)?.message ?? String(err)],
      scrapedAt: new Date().toISOString(),
    });
  }
});

// ============================================================================
// CACHE BUST (admin)
// POST /api/skinsignal/cache/bust
// Clears the in-memory opportunities cache
// ============================================================================
router.post('/cache/bust', (req: Request, res: Response) => {
  bustCache();
  res.json({ message: 'Cache cleared', timestamp: new Date().toISOString() });
});

export default router;

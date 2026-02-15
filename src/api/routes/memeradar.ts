/**
 * MemeRadar API Routes
 * Memecoin discovery and whale tracking
 * 
 * TODO: Paste your working MemeRadar code into the handlers below
 */

import { Router } from 'express';
import { getTokens, getTrending, getWhales } from '../../services/memeradar';

const router = Router();

// ============================================================================
// HEALTH CHECK
// ============================================================================
router.get('/health', (req, res) => {
  res.json({
    app: 'memeradar',
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// ============================================================================
// LIST TOKENS
// GET /api/memeradar/tokens — List all tracked tokens
// ============================================================================
router.get('/tokens', async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit || '20'), 10) || 20, 50);
  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  const chain = typeof req.query.chain === 'string' ? req.query.chain : undefined;

  const tokens = await getTokens({ q, limit, chain });
  res.json({ tokens, count: tokens.length });
});

// ============================================================================
// TOKEN DETAILS
// GET /api/memeradar/tokens/:id — Get token details
// ============================================================================
router.get('/tokens/:id', async (req, res) => {
  // TODO: Paste your working token detail code here
  // Your code should:
  // 1. Fetch token by ID from database
  // 2. Include price history, social metrics, holder stats
  // 3. Return 404 if not found
  
  // STUB:
  res.json({
    id: req.params.id,
    name: 'Example Token',
    symbol: 'EXAMPLE',
    price: 0.001,
    priceChange24h: 15.5,
    volume24h: 1000000,
    marketCap: 10000000,
    holders: 5000,
    message: 'TODO: Paste your working token detail code here'
  });
});

// ============================================================================
// TRENDING
// GET /api/memeradar/trending — Get trending memes
// TODO: Add withSubscription('memeradar', 'basic') for free tier limit
// ============================================================================
router.get('/trending', async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit || '20'), 10) || 20, 50);
  const chain = (typeof req.query.chain === 'string' ? req.query.chain : 'solana') as any;
  const trending = await getTrending({ limit, chain });
  res.json({ trending, count: trending.length });
});

// ============================================================================
// WHALE ACTIVITY
// GET /api/memeradar/whales — Get whale transactions
// TODO: Add withSubscription('memeradar', 'pro') for premium access
// ============================================================================
router.get('/whales', async (req, res) => {
  const wallet = typeof req.query.wallet === 'string' ? req.query.wallet : '';
  if (!wallet) {
    res.status(400).json({ error: 'wallet_required', message: 'Provide ?wallet=<solana_address>' });
    return;
  }
  const limit = Math.min(parseInt(String(req.query.limit || '50'), 10) || 50, 100);
  const whales = await getWhales({ wallet, limit });
  res.json({ whales, count: whales.length });
});

// ============================================================================
// CREATE ALERT
// POST /api/memeradar/alerts — Create price/movement alert
// ============================================================================
router.post('/alerts', async (req, res) => {
  // TODO: Paste your working alert creation code here
  // Your code should:
  // 1. Validate alert criteria (token, condition, threshold)
  // 2. Save to database
  // 3. Return created alert
  
  // STUB:
  res.status(201).json({
    id: 'alert-id',
    token: req.body.token,
    condition: req.body.condition,
    threshold: req.body.threshold,
    active: true,
    message: 'TODO: Paste your working alert creation code here'
  });
});

export default router;

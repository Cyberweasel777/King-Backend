/**
 * MemeRadar API Routes
 * Memecoin discovery and whale tracking
 * 
 * TODO: Paste your working MemeRadar code into the handlers below
 */

import { Router } from 'express';
import { getTokens, getTrending, getWhales, getWhalesWithDebug, getTokenReport } from '../../services/memeradar';
import { buildProvenanceReport } from '../../services/memeradar/provenance';

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
  try {
    const limit = Math.min(parseInt(String(req.query.limit || '20'), 10) || 20, 50);
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const chain = typeof req.query.chain === 'string' ? req.query.chain : undefined;

    const tokens = await getTokens({ q, limit, chain });
    res.json({ tokens, count: tokens.length });
  } catch (error) {
    res.json({
      tokens: [],
      count: 0,
      error: 'tokens_unavailable',
      message: (error as Error)?.message || 'Failed to fetch tokens',
    });
  }
});

// ============================================================================
// TOKEN DETAILS
// GET /api/memeradar/tokens/:id — Get token details
// ============================================================================
router.get('/tokens/:id', async (req, res) => {
  try {
    const chain = (typeof req.query.chain === 'string' ? req.query.chain : 'solana') as 'solana' | 'base';
    const report = await getTokenReport(req.params.id, chain);

    if (!report) {
      res.status(404).json({ error: 'not_found', message: 'Token not found for identifier.' });
      return;
    }

    res.json({
      token: report.token,
      provenance: report.provenance,
    });
  } catch (error) {
    res.status(502).json({
      error: 'token_report_unavailable',
      message: (error as Error)?.message || 'Failed to fetch token report',
    });
  }
});

// ============================================================================
// TRENDING
// GET /api/memeradar/trending — Get trending memes
// TODO: Add withSubscription('memeradar', 'basic') for free tier limit
// ============================================================================
router.get('/trending', async (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit || '20'), 10) || 20, 50);
    const chain = (typeof req.query.chain === 'string' ? req.query.chain : 'solana') as any;
    const trending = await getTrending({ limit, chain });
    const withRisk = trending.map((t) => ({
      ...t,
      provenance: buildProvenanceReport(t.token),
    }));
    res.json({ trending: withRisk, count: withRisk.length });
  } catch (error) {
    res.json({
      trending: [],
      count: 0,
      error: 'trending_unavailable',
      message: (error as Error)?.message || 'Failed to fetch trending',
    });
  }
});

// ============================================================================
// WHALE ACTIVITY
// GET /api/memeradar/whales — Get whale transactions
// TODO: Add withSubscription('memeradar', 'pro') for premium access
// ============================================================================
function isValidSolanaAddress(addr: string): boolean {
  // Lightweight base58 + length validation (avoids pulling web3.js into the API bundle)
  // Solana pubkeys are typically 32 bytes -> base58 strings often 32-44 chars.
  if (!addr) return false;
  const s = addr.trim();
  if (s.length < 32 || s.length > 44) return false;
  // Base58 alphabet (no 0,O,I,l)
  return /^[1-9A-HJ-NP-Za-km-z]+$/.test(s);
}

// Demo wallets for integration/testing
router.get('/whales/demo', (req, res) => {
  res.json({
    chain: 'solana',
    wallets: [
      {
        label: 'System Program (high activity; good for signatures/debug counters)',
        address: '11111111111111111111111111111111',
      },
    ],
    note: 'Public addresses for testing whales/debug plumbing. Real wallets required for meaningful token transfer output.',
  });
});

router.get('/whales', async (req, res) => {
  try {
    const wallet = typeof req.query.wallet === 'string' ? req.query.wallet.trim() : '';
    if (!wallet) {
      res.status(400).json({ error: 'wallet_required', message: 'Provide ?wallet=<solana_address>' });
      return;
    }
    if (!isValidSolanaAddress(wallet)) {
      res.status(400).json({
        error: 'invalid_wallet',
        message: 'Invalid Solana wallet address format. Provide a base58 public key (typically 32-44 chars).',
      });
      return;
    }

    const limit = Math.min(parseInt(String(req.query.limit || '50'), 10) || 50, 100);
    const debug = String(req.query.debug || '').toLowerCase() === 'true';

    if (debug) {
      const { whales, debug: d } = await getWhalesWithDebug({ wallet, limit });
      res.json({
        whales,
        count: whales.length,
        signaturesFetched: d.signaturesFetched,
        txDetailsAttempted: d.txDetailsAttempted,
        txDetailsSucceeded: d.txDetailsSucceeded,
        parsedTransfers: d.parsedTransfers,
        firstError: d.firstError,
        heliusStatusCodes: d.heliusStatusCodes,
      });
      return;
    }

    const whales = await getWhales({ wallet, limit });
    res.json({ whales, count: whales.length });
  } catch (error) {
    res.json({
      whales: [],
      count: 0,
      error: 'whales_unavailable',
      message: (error as Error)?.message || 'Failed to fetch whale activity',
    });
  }
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

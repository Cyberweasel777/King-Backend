"use strict";
/**
 * MemeRadar API Routes
 * Memecoin discovery and whale tracking
 *
 * TODO: Paste your working MemeRadar code into the handlers below
 */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const memeradar_1 = require("../../services/memeradar");
const provenance_1 = require("../../services/memeradar/provenance");
const predictionArb_1 = require("../../services/signals/predictionArb");
const router = (0, express_1.Router)();
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
// PREDICTION SIGNAL FAN-OUT
// GET /api/memeradar/signals/prediction-arb
// ============================================================================
router.get('/signals/prediction-arb', (_req, res) => {
    const { feed, sourcePath } = (0, predictionArb_1.getPredictionArbFeed)();
    if (!feed) {
        res.status(404).json({ error: 'prediction_arb_unavailable', sourcePath });
        return;
    }
    const opportunities = feed.opportunities.slice(0, 10).map((op) => ({
        slug: op.eventSlug,
        title: op.marketTitle,
        outcome: op.outcome,
        buyVenue: op.bestBuyVenue,
        sellVenue: op.bestSellVenue,
        netEdgePct: op.estimatedNetEdgePct,
        grossEdgePct: op.grossEdgePct,
        detectedAt: op.timestamp,
    }));
    res.json({ sourcePath, mode: feed.mode, opportunities, count: opportunities.length });
});
router.get('/signals/prediction-heatmap', (_req, res) => {
    const { feed, sourcePath } = (0, predictionArb_1.getPredictionArbFeed)();
    if (!feed) {
        res.status(404).json({ error: 'prediction_heatmap_unavailable', sourcePath });
        return;
    }
    res.json({ sourcePath, generatedAt: feed.timestamp, mode: feed.mode, heatmap: (0, predictionArb_1.buildHeatMap)(feed) });
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
        const tokens = await (0, memeradar_1.getTokens)({ q, limit, chain });
        res.json({ tokens, count: tokens.length });
    }
    catch (error) {
        res.json({
            tokens: [],
            count: 0,
            error: 'tokens_unavailable',
            message: error?.message || 'Failed to fetch tokens',
        });
    }
});
// ============================================================================
// TOKEN DETAILS
// GET /api/memeradar/tokens/:id — Get token details
// ============================================================================
router.get('/tokens/:id', async (req, res) => {
    try {
        const chain = (typeof req.query.chain === 'string' ? req.query.chain : 'solana');
        const report = await (0, memeradar_1.getTokenReport)(req.params.id, chain);
        if (!report) {
            res.status(404).json({ error: 'not_found', message: 'Token not found for identifier.' });
            return;
        }
        res.json({
            token: report.token,
            provenance: report.provenance,
        });
    }
    catch (error) {
        res.status(502).json({
            error: 'token_report_unavailable',
            message: error?.message || 'Failed to fetch token report',
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
        const chain = (typeof req.query.chain === 'string' ? req.query.chain : 'solana');
        const trending = await (0, memeradar_1.getTrending)({ limit, chain });
        const withRisk = trending.map((t) => ({
            ...t,
            provenance: (0, provenance_1.buildProvenanceReport)(t.token),
        }));
        res.json({ trending: withRisk, count: withRisk.length });
    }
    catch (error) {
        res.json({
            trending: [],
            count: 0,
            error: 'trending_unavailable',
            message: error?.message || 'Failed to fetch trending',
        });
    }
});
// ============================================================================
// WHALE ACTIVITY
// GET /api/memeradar/whales — Get whale transactions
// TODO: Add withSubscription('memeradar', 'pro') for premium access
// ============================================================================
function isValidSolanaAddress(addr) {
    // Lightweight base58 + length validation (avoids pulling web3.js into the API bundle)
    // Solana pubkeys are typically 32 bytes -> base58 strings often 32-44 chars.
    if (!addr)
        return false;
    const s = addr.trim();
    if (s.length < 32 || s.length > 44)
        return false;
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
            const { whales, debug: d } = await (0, memeradar_1.getWhalesWithDebug)({ wallet, limit });
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
        const whales = await (0, memeradar_1.getWhales)({ wallet, limit });
        res.json({ whales, count: whales.length });
    }
    catch (error) {
        res.json({
            whales: [],
            count: 0,
            error: 'whales_unavailable',
            message: error?.message || 'Failed to fetch whale activity',
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
exports.default = router;
//# sourceMappingURL=memeradar.js.map
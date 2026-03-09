"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const x402Gate_1 = require("../middleware/x402Gate");
const logger_1 = __importDefault(require("../../config/logger"));
const client_1 = require("../../services/botindex/pumpfun/client");
const router = (0, express_1.Router)();
router.get('/pumpfun/graduating', (0, x402Gate_1.createX402Gate)({ price: '$0.01', description: 'Pump.fun tokens approaching bonding curve graduation (>80% progress)' }), async (_req, res) => {
    try {
        const tokens = await (0, client_1.getGraduatingTokens)();
        res.json({
            count: tokens.length,
            tokens,
            source: process.env.PUMPFUN_LIVE === 'true' ? 'live' : 'stub',
            generatedAt: new Date().toISOString(),
        });
    }
    catch (err) {
        logger_1.default.error({ err }, '[pumpfun] Failed to fetch graduating tokens');
        res.status(502).json({
            error: 'pumpfun_graduating_failed',
            message: err instanceof Error ? err.message : 'Failed to fetch graduating tokens',
        });
    }
});
router.get('/pumpfun/graduated', (0, x402Gate_1.createX402Gate)({ price: '$0.02', description: 'Recently graduated Pump.fun tokens with rug risk scores' }), async (req, res) => {
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
        const graduations = await (0, client_1.getRecentGraduations)(limit);
        res.json({
            count: graduations.length,
            graduations,
            source: process.env.PUMPFUN_LIVE === 'true' ? 'live' : 'stub',
            generatedAt: new Date().toISOString(),
        });
    }
    catch (err) {
        logger_1.default.error({ err }, '[pumpfun] Failed to fetch graduated tokens');
        res.status(502).json({
            error: 'pumpfun_graduated_failed',
            message: err instanceof Error ? err.message : 'Failed to fetch graduated tokens',
        });
    }
});
router.get('/pumpfun/rug-score/:mint', (0, x402Gate_1.createX402Gate)({ price: '$0.02', description: 'Detailed rug risk analysis for a specific Pump.fun token' }), async (req, res) => {
    const { mint } = req.params;
    if (!mint || mint.length < 32 || mint.length > 50) {
        res.status(400).json({
            error: 'invalid_mint',
            message: 'Provide a valid Solana mint address (32-44 characters)',
        });
        return;
    }
    try {
        const score = await (0, client_1.getRugScore)(mint);
        res.json({
            ...score,
            source: process.env.PUMPFUN_LIVE === 'true' ? 'live' : 'stub',
            generatedAt: new Date().toISOString(),
        });
    }
    catch (err) {
        logger_1.default.error({ err, mint }, '[pumpfun] Failed to compute rug score');
        res.status(502).json({
            error: 'pumpfun_rug_score_failed',
            message: err instanceof Error ? err.message : 'Failed to compute rug score',
        });
    }
});
exports.default = router;
//# sourceMappingURL=botindex-pumpfun.js.map
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const x402Gate_1 = require("../middleware/x402Gate");
const logger_1 = __importDefault(require("../../config/logger"));
const trending_1 = require("../../services/botindex/zora/trending");
const creator_scores_1 = require("../../services/botindex/zora/creator-scores");
const attention_1 = require("../../services/botindex/zora/attention");
const router = (0, express_1.Router)();
const METADATA = {
    protocol: 'x402',
    version: '1.0',
    provider: 'Renaldo Corp / BotIndex',
    market: 'zora',
};
function parseLimit(value, defaultValue = 10, maxValue = 50) {
    if (value === undefined)
        return defaultValue;
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
        return null;
    }
    return Math.min(parsed, maxValue);
}
router.get('/zora/trending-coins', async (req, res) => {
    const limit = parseLimit(req.query.limit);
    if (limit === null) {
        res.status(400).json({
            error: 'invalid_limit',
            message: 'Query parameter limit must be a positive integer',
            metadata: METADATA,
        });
        return;
    }
    try {
        const data = await (0, trending_1.getZoraTrendingCoins)(limit);
        res.json({
            ...data,
            count: data.coins.length,
            timestamp: new Date().toISOString(),
            metadata: {
                ...METADATA,
                endpoint: '/botindex/zora/trending-coins',
                price: 'FREE',
            },
        });
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Failed to fetch Zora trending coins');
        res.status(500).json({
            error: 'zora_trending_fetch_failed',
            message: error instanceof Error ? error.message : 'Unknown error',
            metadata: METADATA,
        });
    }
});
router.get('/zora/creator-scores', (0, x402Gate_1.createX402Gate)({ price: '$0.01', description: 'Zora creator scores (0.01 USDC)' }), async (req, res) => {
    const limit = parseLimit(req.query.limit);
    if (limit === null) {
        res.status(400).json({
            error: 'invalid_limit',
            message: 'Query parameter limit must be a positive integer',
            metadata: METADATA,
        });
        return;
    }
    try {
        const data = await (0, creator_scores_1.getZoraCreatorScores)(limit);
        res.json({
            ...data,
            count: data.creators.length,
            timestamp: new Date().toISOString(),
            metadata: {
                ...METADATA,
                endpoint: '/botindex/zora/creator-scores',
                price: '$0.01',
            },
        });
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Failed to fetch Zora creator scores');
        res.status(500).json({
            error: 'zora_creator_scores_failed',
            message: error instanceof Error ? error.message : 'Unknown error',
            metadata: METADATA,
        });
    }
});
router.get('/zora/attention-momentum', (0, x402Gate_1.createX402Gate)({ price: '$0.01', description: 'Zora attention momentum (0.01 USDC)' }), async (req, res) => {
    const limit = parseLimit(req.query.limit);
    if (limit === null) {
        res.status(400).json({
            error: 'invalid_limit',
            message: 'Query parameter limit must be a positive integer',
            metadata: METADATA,
        });
        return;
    }
    try {
        const data = await (0, attention_1.getAttentionMomentum)(limit);
        res.json({
            ...data,
            count: data.trends.length,
            timestamp: new Date().toISOString(),
            metadata: {
                ...METADATA,
                endpoint: '/botindex/zora/attention-momentum',
                price: '$0.01',
            },
        });
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Failed to fetch Zora attention momentum');
        res.status(500).json({
            error: 'zora_attention_momentum_failed',
            message: error instanceof Error ? error.message : 'Unknown error',
            metadata: METADATA,
        });
    }
});
exports.default = router;
//# sourceMappingURL=botindex-zora.js.map
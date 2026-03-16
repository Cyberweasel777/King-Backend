"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const logger_1 = __importDefault(require("../../config/logger"));
const trending_1 = require("../../services/botindex/zora/trending");
const creator_scores_1 = require("../../services/botindex/zora/creator-scores");
const attention_1 = require("../../services/botindex/zora/attention");
const response_cta_1 = require("../../shared/response-cta");
const router = (0, express_1.Router)();
const METADATA = {
    protocol: 'x402',
    version: '1.0',
    provider: 'Renaldo Corp / BotIndex',
    market: 'zora',
};
function buildTrendingSummary(coins) {
    const top = coins[0];
    if (!top) {
        return '0 trending tokens. Top mover: none with 0 volume attention score.';
    }
    return `${coins.length} trending tokens. Top mover: ${top.name} with ${top.volume24h.toFixed(2)} volume attention score.`;
}
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
        const topCoin = data.coins[0];
        const zoraTeaser = topCoin
            ? `DeepSeek launch alpha: ${topCoin.name} showing ${topCoin.volume24h > 1000 ? 'breakout' : 'early'} attention signals. Entry confidence + risk score available with API key.`
            : undefined;
        res.json({
            ...data,
            summary: buildTrendingSummary(data.coins),
            count: data.coins.length,
            timestamp: new Date().toISOString(),
            metadata: {
                ...METADATA,
                endpoint: '/botindex/zora/trending-coins',
                price: 'FREE',
            },
            ...(0, response_cta_1.buildFreeCTA)(zoraTeaser),
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
router.get('/zora/creator-scores', async (req, res) => {
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
                price: 'FREE',
            },
            ...(0, response_cta_1.buildFreeCTA)('DeepSeek launch alpha: scores creator track records + token momentum to flag high-conviction early entries. Upgrade for full analysis.'),
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
router.get('/zora/attention-momentum', async (req, res) => {
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
                price: 'FREE',
            },
            ...(0, response_cta_1.buildFreeCTA)('DeepSeek convergence detector: cross-references attention spikes with on-chain flows to find breakout candidates before the crowd. Upgrade for signals.'),
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
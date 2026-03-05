"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const x402Gate_1 = require("../middleware/x402Gate");
const freeTrial_1 = require("../middleware/freeTrial");
const fetcher_1 = require("../../services/botindex/engine/fetcher");
const universe_1 = require("../../services/botindex/engine/universe");
const matrix_1 = require("../../services/botindex/engine/matrix");
const router = (0, express_1.Router)();
const querySchema = zod_1.z.object({
    window: zod_1.z.enum(['1h', '24h', '7d', '30d']).default('24h'),
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(10),
    minScore: zod_1.z.coerce.number().int().min(0).max(100).default(0),
    tokens: zod_1.z.string().optional(),
});
router.get('/correlation-leaders', (0, freeTrial_1.freeTrialGate)(), (0, freeTrial_1.skipIfFreeTrial)((0, x402Gate_1.createX402Gate)({
    price: '$0.01',
    description: 'BotIndex correlation leaders (x402 test route)',
})), async (req, res) => {
    try {
        const parsedQuery = querySchema.safeParse(req.query);
        if (!parsedQuery.success) {
            res.status(400).json({
                error: 'invalid_query',
                message: parsedQuery.error.issues[0]?.message || 'Invalid query parameters',
            });
            return;
        }
        const { window, limit, minScore, tokens } = parsedQuery.data;
        if (!matrix_1.TIME_WINDOWS[window]) {
            res.status(400).json({
                error: 'Invalid window. Use: 1h, 24h, 7d, 30d'
            });
            return;
        }
        const tokenUniverse = tokens
            ? tokens
                .split(',')
                .map((t) => t.trim())
                .filter((t) => t.length > 0)
            : await (0, universe_1.getBotindexTokenUniverse)(30);
        const priceSeriesMap = await (0, fetcher_1.fetchMultiplePriceSeries)(tokenUniverse, window);
        const priceSeries = Array.from(priceSeriesMap.values());
        if (priceSeries.length < 2) {
            res.status(400).json({
                error: 'Insufficient price data'
            });
            return;
        }
        const leaders = (0, matrix_1.identifyMarketLeaders)(priceSeries)
            .filter((leader) => leader.leadScore >= minScore)
            .slice(0, limit);
        res.json({
            leaders: leaders.map((leader) => ({
                token: leader.token,
                leadScore: leader.leadScore,
                avgLeadTime: leader.avgLeadTime,
                numLedTokens: leader.numLedTokens,
                causalityStrength: leader.causalityStrength,
            })),
            calculatedAt: new Date().toISOString(),
        });
    }
    catch (error) {
        res.status(500).json({
            error: 'Failed to identify market leaders',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
exports.default = router;
//# sourceMappingURL=x402-test.js.map
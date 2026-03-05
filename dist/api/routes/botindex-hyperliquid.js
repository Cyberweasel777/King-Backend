"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const x402Gate_1 = require("../middleware/x402Gate");
const logger_1 = __importDefault(require("../../config/logger"));
const funding_arb_1 = require("../../services/botindex/hyperliquid/funding-arb");
const correlation_1 = require("../../services/botindex/hyperliquid/correlation");
const liquidations_1 = require("../../services/botindex/hyperliquid/liquidations");
const router = (0, express_1.Router)();
const METADATA = {
    protocol: 'x402',
    version: '1.0',
    provider: 'Renaldo Corp / BotIndex',
    market: 'hyperliquid',
};
router.get('/hyperliquid/funding-arb', (0, x402Gate_1.createX402Gate)({ price: '$0.01', description: 'Hyperliquid vs Binance funding arbitrage (0.01 USDC)' }), async (_req, res) => {
    try {
        const data = await (0, funding_arb_1.getFundingArbOpportunities)();
        res.json({
            ...data,
            count: data.opportunities.length,
            timestamp: new Date().toISOString(),
            metadata: {
                ...METADATA,
                endpoint: '/botindex/hyperliquid/funding-arb',
                price: '$0.01',
            },
        });
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Failed to fetch Hyperliquid funding arbitrage');
        res.status(500).json({
            error: 'hyperliquid_funding_arb_failed',
            message: error instanceof Error ? error.message : 'Unknown error',
            metadata: METADATA,
        });
    }
});
router.get('/hyperliquid/correlation-matrix', (0, x402Gate_1.createX402Gate)({ price: '$0.01', description: 'Hyperliquid perp cross-market correlation matrix (0.01 USDC)' }), async (_req, res) => {
    try {
        const data = await (0, correlation_1.getHLCorrelationMatrix)();
        res.json({
            ...data,
            metadata: {
                ...METADATA,
                endpoint: '/botindex/hyperliquid/correlation-matrix',
                price: '$0.01',
            },
        });
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Failed to fetch Hyperliquid correlation matrix');
        res.status(500).json({
            error: 'hyperliquid_correlation_matrix_failed',
            message: error instanceof Error ? error.message : 'Unknown error',
            metadata: METADATA,
        });
    }
});
router.get('/hyperliquid/liquidation-heatmap', (0, x402Gate_1.createX402Gate)({ price: '$0.01', description: 'Hyperliquid liquidation heatmap (0.01 USDC)' }), async (_req, res) => {
    try {
        const data = await (0, liquidations_1.getLiquidationHeatmap)();
        res.json({
            ...data,
            count: data.heatmap.length,
            timestamp: new Date().toISOString(),
            metadata: {
                ...METADATA,
                endpoint: '/botindex/hyperliquid/liquidation-heatmap',
                price: '$0.01',
            },
        });
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Failed to fetch Hyperliquid liquidation heatmap');
        res.status(500).json({
            error: 'hyperliquid_liquidation_heatmap_failed',
            message: error instanceof Error ? error.message : 'Unknown error',
            metadata: METADATA,
        });
    }
});
exports.default = router;
//# sourceMappingURL=botindex-hyperliquid.js.map
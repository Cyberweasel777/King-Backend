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
const whale_alerts_1 = require("../../services/botindex/hyperliquid/whale-alerts");
const liquidations_1 = require("../../services/botindex/hyperliquid/liquidations");
const hip6_1 = require("../../services/botindex/hyperliquid/hip6");
const router = (0, express_1.Router)();
const METADATA = {
    protocol: 'x402',
    version: '1.0',
    provider: 'Renaldo Corp / BotIndex',
    market: 'hyperliquid',
};
router.get('/hyperliquid/funding-arb', async (_req, res) => {
    try {
        const data = await (0, funding_arb_1.getFundingArbOpportunities)();
        res.json({
            ...data,
            count: data.opportunities.length,
            timestamp: new Date().toISOString(),
            metadata: {
                ...METADATA,
                endpoint: '/botindex/hyperliquid/funding-arb',
                price: 'FREE',
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
router.get('/hyperliquid/correlation-matrix', async (_req, res) => {
    try {
        const data = await (0, correlation_1.getHLCorrelationMatrix)();
        res.json({
            ...data,
            metadata: {
                ...METADATA,
                endpoint: '/botindex/hyperliquid/correlation-matrix',
                price: 'FREE',
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
router.get('/hyperliquid/liquidation-heatmap', async (_req, res) => {
    try {
        const data = await (0, liquidations_1.getLiquidationHeatmap)();
        res.json({
            ...data,
            count: data.heatmap.length,
            timestamp: new Date().toISOString(),
            metadata: {
                ...METADATA,
                endpoint: '/botindex/hyperliquid/liquidation-heatmap',
                price: 'FREE',
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
router.get('/hyperliquid/hip6/status', async (_req, res) => {
    res.json({
        status: 'active',
        protocol: 'HIP-6',
        mode: 'signal_intelligence',
        source: 'live_hyperliquid_market_data',
        endpoints: {
            feedHistory: '/api/botindex/hyperliquid/hip6/feed-history',
            alertScores: '/api/botindex/hyperliquid/hip6/alert-scores',
            launchCandidates: '/api/botindex/hyperliquid/hip6/launch-candidates',
        },
        note: 'Signal layer for HIP-6 opportunity monitoring. Not an official Hyperliquid auction feed.',
        timestamp: new Date().toISOString(),
    });
});
router.get('/hyperliquid/hip6/feed-history', async (req, res) => {
    try {
        await (0, hip6_1.ensureHip6Primed)();
        const limitRaw = Number.parseInt(String(req.query.limit ?? '24'), 10);
        const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, limitRaw)) : 24;
        const data = (0, hip6_1.getHip6FeedHistory)(limit);
        res.json({
            ...data,
            count: data.history.length,
            metadata: {
                ...METADATA,
                endpoint: '/botindex/hyperliquid/hip6/feed-history',
                price: 'free',
            },
        });
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Failed to fetch HIP-6 feed history');
        res.status(500).json({
            error: 'hyperliquid_hip6_feed_history_failed',
            message: error instanceof Error ? error.message : 'Unknown error',
            metadata: METADATA,
        });
    }
});
router.get('/hyperliquid/hip6/alert-scores', async (req, res) => {
    try {
        await (0, hip6_1.ensureHip6Primed)();
        const limitRaw = Number.parseInt(String(req.query.limit ?? '20'), 10);
        const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, limitRaw)) : 20;
        const data = (0, hip6_1.getHip6AlertScores)(limit);
        res.json({
            ...data,
            count: data.alerts.length,
            metadata: {
                ...METADATA,
                endpoint: '/botindex/hyperliquid/hip6/alert-scores',
                price: 'free',
            },
        });
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Failed to fetch HIP-6 alert scores');
        res.status(500).json({
            error: 'hyperliquid_hip6_alert_scores_failed',
            message: error instanceof Error ? error.message : 'Unknown error',
            metadata: METADATA,
        });
    }
});
router.get('/hyperliquid/hip6/launch-candidates', (0, x402Gate_1.createX402Gate)({ price: '$0.01', description: 'HIP-6 launch candidate ranking from live HL market data (0.01 USDC)' }), async (req, res) => {
    try {
        const limitRaw = Number.parseInt(String(req.query.limit ?? '20'), 10);
        const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, limitRaw)) : 20;
        const data = await (0, hip6_1.getHip6LaunchCandidates)(limit);
        res.json({
            ...data,
            count: data.candidates.length,
            metadata: {
                ...METADATA,
                endpoint: '/botindex/hyperliquid/hip6/launch-candidates',
                price: '$0.01',
            },
        });
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Failed to fetch HIP-6 launch candidates');
        res.status(500).json({
            error: 'hyperliquid_hip6_launch_candidates_failed',
            message: error instanceof Error ? error.message : 'Unknown error',
            metadata: METADATA,
        });
    }
});
// --- Whale Alerts ---
router.get('/hyperliquid/whale-alerts', async (_req, res) => {
    try {
        const data = await (0, whale_alerts_1.getHyperliquidWhaleAlerts)();
        res.json({
            summary: {
                totalTrackedValue: data.totalTrackedValue,
                whalesTracked: data.whalesTracked,
                topPositions: data.topPositions.slice(0, 3).map(p => ({
                    coin: p.coin,
                    side: p.side,
                    positionValue: p.positionValue,
                    leverage: p.leverage,
                })),
                recentTradeCount: data.recentLargeTrades.length,
            },
            upgrade: 'Full whale data is now free. GET /api/botindex/hyperliquid/whale-alerts/full',
            timestamp: data.timestamp,
            metadata: {
                ...METADATA,
                endpoint: '/botindex/hyperliquid/whale-alerts',
                price: 'free (summary)',
            },
        });
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Failed to fetch Hyperliquid whale alerts');
        res.status(500).json({
            error: 'hyperliquid_whale_alerts_failed',
            message: error instanceof Error ? error.message : 'Unknown error',
            metadata: METADATA,
        });
    }
});
router.get('/hyperliquid/whale-alerts/full', async (_req, res) => {
    try {
        const data = await (0, whale_alerts_1.getHyperliquidWhaleAlerts)();
        res.json({
            ...data,
            metadata: {
                ...METADATA,
                endpoint: '/botindex/hyperliquid/whale-alerts/full',
                price: 'FREE',
            },
        });
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Failed to fetch Hyperliquid whale alerts (full)');
        res.status(500).json({
            error: 'hyperliquid_whale_alerts_full_failed',
            message: error instanceof Error ? error.message : 'Unknown error',
            metadata: METADATA,
        });
    }
});
exports.default = router;
//# sourceMappingURL=botindex-hyperliquid.js.map
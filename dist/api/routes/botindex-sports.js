"use strict";
/**
 * BotIndex Sports Routes — Unified sports data surface
 * Aggregates SpreadHunter, RosterRadar, and ArbWatch data
 */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const x402Gate_1 = require("../middleware/x402Gate");
const oddsProvider_1 = require("../../services/sports/oddsProvider");
const rosterProvider_1 = require("../../services/sports/rosterProvider");
const scanner_1 = require("../../services/arbwatch/scanner");
const router = (0, express_1.Router)();
// GET /v1/sports/odds — Live odds snapshot
router.get('/sports/odds', (0, x402Gate_1.createX402Gate)({ price: '$0.02', description: 'Live sports odds snapshot' }), async (_req, res) => {
    try {
        const data = await (0, oddsProvider_1.getOddsSnapshot)();
        res.json({
            ...data,
            source: 'spreadhunter',
            metadata: { protocol: 'x402', endpoint: '/v1/sports/odds' },
        });
    }
    catch (error) {
        res.status(500).json({
            error: 'odds_fetch_failed',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
// GET /v1/sports/lines — Line movement tracker
router.get('/sports/lines', (0, x402Gate_1.createX402Gate)({ price: '$0.02', description: 'Sports line movements with sharp action flags' }), async (_req, res) => {
    try {
        const data = await (0, oddsProvider_1.getLineMovements)();
        res.json({
            ...data,
            source: 'spreadhunter',
            metadata: { protocol: 'x402', endpoint: '/v1/sports/lines' },
        });
    }
    catch (error) {
        res.status(500).json({
            error: 'lines_fetch_failed',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
// GET /v1/sports/props — Prop bet movements
router.get('/sports/props', (0, x402Gate_1.createX402Gate)({ price: '$0.02', description: 'Top prop bet movements with confidence scores' }), async (_req, res) => {
    try {
        const data = await (0, oddsProvider_1.getTopProps)();
        res.json({
            ...data,
            source: 'spreadhunter',
            metadata: { protocol: 'x402', endpoint: '/v1/sports/props' },
        });
    }
    catch (error) {
        res.status(500).json({
            error: 'props_fetch_failed',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
// GET /v1/sports/correlations — Player/team correlations
router.get('/sports/correlations', (0, x402Gate_1.createX402Gate)({ price: '$0.05', description: 'Player correlation matrix for DFS and betting' }), async (_req, res) => {
    try {
        const data = await (0, rosterProvider_1.getCorrelations)();
        res.json({
            ...data,
            source: 'rosterradar',
            metadata: { protocol: 'x402', endpoint: '/v1/sports/correlations' },
        });
    }
    catch (error) {
        res.status(500).json({
            error: 'correlations_fetch_failed',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
// GET /v1/sports/optimizer — DFS lineup optimizer
router.get('/sports/optimizer', (0, x402Gate_1.createX402Gate)({ price: '$0.10', description: 'Correlation-adjusted DFS lineup optimizer' }), async (_req, res) => {
    try {
        const data = await (0, rosterProvider_1.getLineupOptimizer)();
        res.json({
            ...data,
            source: 'rosterradar',
            metadata: { protocol: 'x402', endpoint: '/v1/sports/optimizer' },
        });
    }
    catch (error) {
        res.status(500).json({
            error: 'optimizer_fetch_failed',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
// GET /v1/sports/arb — Cross-platform arbitrage scanner
router.get('/sports/arb', (0, x402Gate_1.createX402Gate)({ price: '$0.05', description: 'Cross-platform prediction/sportsbook arbitrage scanner' }), async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit) || 10, 50);
        const minEdge = Number(req.query.minEdge) || 0;
        const result = await (0, scanner_1.runArbScanner)({
            limit,
            minEdgePct: minEdge,
            maxPerEvent: 3,
        });
        res.json({
            ...result,
            source: 'arbwatch',
            metadata: { protocol: 'x402', endpoint: '/v1/sports/arb' },
        });
    }
    catch (error) {
        res.status(500).json({
            error: 'arb_scan_failed',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
exports.default = router;
//# sourceMappingURL=botindex-sports.js.map
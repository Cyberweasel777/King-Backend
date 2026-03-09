"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const x402Gate_1 = require("../middleware/x402Gate");
const logger_1 = __importDefault(require("../../config/logger"));
const client_1 = require("../../services/botindex/hip4/client");
const scorer_1 = require("../../services/botindex/hip4/scorer");
const types_1 = require("../../services/botindex/hip4/types");
const router = (0, express_1.Router)();
const HIP4_NOT_LIVE_MESSAGE = 'HIP-4 outcome trading is on testnet. Monitor https://app.hyperliquid.xyz for mainnet launch.';
function parseIntegerParam(value, fallback, min = 1, max = 500) {
    if (value === undefined) {
        return fallback;
    }
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isFinite(parsed) || parsed < min) {
        return null;
    }
    return Math.min(parsed, max);
}
function parseStatus(value) {
    const normalized = String(value).trim().toUpperCase();
    if (!normalized) {
        return null;
    }
    const statuses = Object.values(types_1.HIP4Status);
    if (!statuses.includes(normalized)) {
        return null;
    }
    return normalized;
}
function parseBooleanParam(value) {
    const normalized = String(value).trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
        return true;
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'no') {
        return false;
    }
    return null;
}
function round(value, decimals = 2) {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
}
function summarizePositions(positions) {
    const totalPositions = positions.length;
    const uniqueHolders = new Set(positions
        .map((position) => position.holder.trim().toLowerCase())
        .filter((holder) => holder.length > 0)).size;
    let yesPositions = 0;
    let noPositions = 0;
    let totalSize = 0;
    let yesSize = 0;
    let noSize = 0;
    let netPnl = 0;
    for (const position of positions) {
        const size = Math.max(0, position.size);
        totalSize += size;
        netPnl += Number.isFinite(position.pnl) ? position.pnl : 0;
        if (position.side === 'YES') {
            yesPositions += 1;
            yesSize += size;
        }
        else {
            noPositions += 1;
            noSize += size;
        }
    }
    return {
        totalPositions,
        uniqueHolders,
        yesPositions,
        noPositions,
        totalSize: round(totalSize, 4),
        yesSize: round(yesSize, 4),
        noSize: round(noSize, 4),
        netPnl: round(netPnl, 4),
    };
}
function toEpochMs(timestamp) {
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
        return 0;
    }
    return timestamp > 10_000_000_000 ? timestamp : timestamp * 1000;
}
function deriveStatus(market) {
    if (market.settled) {
        return types_1.HIP4Status.SETTLED;
    }
    const nowMs = Date.now();
    const createdAtMs = toEpochMs(market.createdAt);
    const expiryMs = toEpochMs(market.expiryAt);
    if (expiryMs > 0 && expiryMs <= nowMs) {
        return types_1.HIP4Status.EXPIRED;
    }
    if (createdAtMs > nowMs) {
        return types_1.HIP4Status.PENDING;
    }
    return types_1.HIP4Status.ACTIVE;
}
router.get('/hip4/markets', (0, x402Gate_1.createX402Gate)({ price: '$0.01', description: 'Active HIP-4 outcome markets with risk scores' }), async (req, res) => {
    const limit = parseIntegerParam(req.query.limit, 20, 1, 100);
    if (limit === null) {
        res.status(400).json({
            error: 'invalid_limit',
            message: 'Query parameter limit must be a positive integer',
        });
        return;
    }
    let statusFilter;
    if (req.query.status !== undefined) {
        const parsedStatus = parseStatus(req.query.status);
        if (!parsedStatus) {
            res.status(400).json({
                error: 'invalid_status',
                message: `Query parameter status must be one of: ${Object.values(types_1.HIP4Status).join(', ')}`,
            });
            return;
        }
        statusFilter = parsedStatus;
    }
    let settledFilter;
    if (req.query.settled !== undefined) {
        const parsedSettled = parseBooleanParam(req.query.settled);
        if (parsedSettled === null) {
            res.status(400).json({
                error: 'invalid_settled',
                message: 'Query parameter settled must be a boolean (true or false)',
            });
            return;
        }
        settledFilter = parsedSettled;
    }
    if (!client_1.hip4Client.isLive()) {
        res.json({
            markets: [],
            live: false,
            message: HIP4_NOT_LIVE_MESSAGE,
            count: 0,
            source: 'hip4',
            updatedAt: new Date().toISOString(),
        });
        return;
    }
    try {
        const markets = await client_1.hip4Client.getActiveMarkets();
        const statusFiltered = statusFilter ? markets.filter((market) => deriveStatus(market) === statusFilter) : markets;
        const settledFiltered = settledFilter === undefined ? statusFiltered : statusFiltered.filter((market) => market.settled === settledFilter);
        const limited = settledFiltered.slice(0, limit);
        const scoredMarkets = await Promise.all(limited.map(async (market) => {
            const [positions, settlementStatus] = await Promise.all([
                client_1.hip4Client.getPositions(market.marketId),
                client_1.hip4Client.getSettlementStatus(market.marketId),
            ]);
            const scoreCard = (0, scorer_1.formatScoreCard)((0, scorer_1.scoreMarket)(market, positions, settlementStatus.source ?? undefined));
            return {
                market,
                score: scoreCard.score,
                tier: scoreCard.tier,
                factors: scoreCard.factors,
            };
        }));
        res.json({
            markets: scoredMarkets,
            live: true,
            count: scoredMarkets.length,
            source: 'hip4',
            updatedAt: new Date().toISOString(),
        });
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Failed to fetch HIP-4 markets');
        res.status(500).json({
            error: 'hip4_markets_failed',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
router.get('/hip4/market/:marketId', (0, x402Gate_1.createX402Gate)({ price: '$0.02', description: 'Deep analysis of a HIP-4 outcome market' }), async (req, res) => {
    const marketId = String(req.params.marketId || '').trim();
    if (!marketId) {
        res.status(400).json({
            error: 'invalid_market_id',
            message: 'Path parameter marketId is required',
        });
        return;
    }
    if (!client_1.hip4Client.isLive()) {
        res.json({
            live: false,
            message: HIP4_NOT_LIVE_MESSAGE,
        });
        return;
    }
    try {
        const market = await client_1.hip4Client.getMarketDetails(marketId);
        if (!market) {
            res.status(404).json({
                error: 'market_not_found',
                message: 'No HIP-4 market found for the provided marketId',
            });
            return;
        }
        const [positions, settlementStatus] = await Promise.all([
            client_1.hip4Client.getPositions(marketId),
            client_1.hip4Client.getSettlementStatus(marketId),
        ]);
        const scoreCard = (0, scorer_1.formatScoreCard)((0, scorer_1.scoreMarket)(market, positions, settlementStatus.source ?? undefined));
        res.json({
            live: true,
            market,
            score: scoreCard.score,
            tier: scoreCard.tier,
            factors: scoreCard.factors,
            positions,
            positionSummary: summarizePositions(positions),
            settlement: settlementStatus,
            source: 'hip4',
            updatedAt: new Date().toISOString(),
        });
    }
    catch (error) {
        logger_1.default.error({ err: error, marketId }, 'Failed to fetch HIP-4 market deep dive');
        res.status(500).json({
            error: 'hip4_market_failed',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
router.get('/hip4/settlement/:marketId', (0, x402Gate_1.createX402Gate)({ price: '$0.01', description: 'Settlement source tracking for a HIP-4 market' }), async (req, res) => {
    const marketId = String(req.params.marketId || '').trim();
    if (!marketId) {
        res.status(400).json({
            error: 'invalid_market_id',
            message: 'Path parameter marketId is required',
        });
        return;
    }
    if (!client_1.hip4Client.isLive()) {
        res.json({
            live: false,
            message: HIP4_NOT_LIVE_MESSAGE,
        });
        return;
    }
    try {
        const settlement = await client_1.hip4Client.getSettlementStatus(marketId);
        res.json({
            live: true,
            marketId,
            settlementSource: settlement.source,
            contract: settlement.contract,
            source: 'hip4',
            updatedAt: new Date().toISOString(),
        });
    }
    catch (error) {
        logger_1.default.error({ err: error, marketId }, 'Failed to fetch HIP-4 settlement status');
        res.status(500).json({
            error: 'hip4_settlement_failed',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
exports.default = router;
//# sourceMappingURL=botindex-hip4.js.map
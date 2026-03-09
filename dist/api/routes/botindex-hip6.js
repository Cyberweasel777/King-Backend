"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const x402Gate_1 = require("../middleware/x402Gate");
const logger_1 = __importDefault(require("../../config/logger"));
const client_1 = require("../../services/botindex/hip6/client");
const scorer_1 = require("../../services/botindex/hip6/scorer");
const types_1 = require("../../services/botindex/hip6/types");
const router = (0, express_1.Router)();
const HIP6_NOT_LIVE_MESSAGE = 'HIP-6 is not yet active on Hyperliquid. Monitor https://hyperliquid.gitbook.io for updates.';
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
function parseAuctionStatus(value) {
    const normalized = String(value).trim().toUpperCase();
    if (!normalized) {
        return null;
    }
    const statuses = Object.values(types_1.AuctionStatus);
    if (!statuses.includes(normalized)) {
        return null;
    }
    return normalized;
}
function round(value, decimals = 2) {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
}
function summarizeBids(bids) {
    const totalBids = bids.length;
    const uniqueBidders = new Set(bids
        .map((bid) => bid.bidder.trim().toLowerCase())
        .filter((bidder) => bidder.length > 0)).size;
    const totalBudget = bids.reduce((acc, bid) => acc + Math.max(0, bid.budget), 0);
    const totalMaxPrice = bids.reduce((acc, bid) => acc + Math.max(0, bid.maxPrice), 0);
    const statusCounts = {
        PENDING: 0,
        ACTIVE: 0,
        CLEARED: 0,
        CANCELLED: 0,
    };
    for (const bid of bids) {
        statusCounts[bid.status] += 1;
    }
    return {
        totalBids,
        uniqueBidders,
        totalBudget: round(totalBudget),
        averageBudget: totalBids > 0 ? round(totalBudget / totalBids) : 0,
        averageMaxPrice: totalBids > 0 ? round(totalMaxPrice / totalBids, 6) : 0,
        statusCounts,
    };
}
router.get('/hip6/auctions', (0, x402Gate_1.createX402Gate)({ price: '$0.01', description: 'Active HIP-6 token auctions with risk scores' }), async (req, res) => {
    const limit = parseIntegerParam(req.query.limit, 16, 1, 100);
    if (limit === null) {
        res.status(400).json({
            error: 'invalid_limit',
            message: 'Query parameter limit must be a positive integer',
        });
        return;
    }
    let statusFilter;
    if (req.query.status !== undefined) {
        const parsedStatus = parseAuctionStatus(req.query.status);
        if (!parsedStatus) {
            res.status(400).json({
                error: 'invalid_status',
                message: `Query parameter status must be one of: ${Object.values(types_1.AuctionStatus).join(', ')}`,
            });
            return;
        }
        statusFilter = parsedStatus;
    }
    if (!client_1.hip6Client.isLive()) {
        res.json({
            auctions: [],
            live: false,
            message: HIP6_NOT_LIVE_MESSAGE,
            count: 0,
            source: 'hip6',
            updatedAt: new Date().toISOString(),
        });
        return;
    }
    try {
        const auctions = await client_1.hip6Client.getActiveAuctions();
        const filtered = statusFilter ? auctions.filter((auction) => auction.status === statusFilter) : auctions;
        const limited = filtered.slice(0, limit);
        const scoredAuctions = await Promise.all(limited.map(async (auction) => {
            const [bids, clearingEvents] = await Promise.all([
                client_1.hip6Client.getAuctionBids(auction.auctionId),
                client_1.hip6Client.getClearingHistory(auction.auctionId, 100),
            ]);
            const scoreCard = (0, scorer_1.formatScoreCard)((0, scorer_1.scoreAuction)(auction, bids, clearingEvents));
            return {
                auction,
                score: scoreCard.score,
                tier: scoreCard.tier,
                factors: scoreCard.factors,
            };
        }));
        res.json({
            auctions: scoredAuctions,
            live: true,
            count: scoredAuctions.length,
            source: 'hip6',
            updatedAt: new Date().toISOString(),
        });
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Failed to fetch HIP-6 auctions');
        res.status(500).json({
            error: 'hip6_auctions_failed',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
router.get('/hip6/auction/:auctionId', (0, x402Gate_1.createX402Gate)({ price: '$0.02', description: 'Deep analysis of a HIP-6 auction' }), async (req, res) => {
    const auctionId = String(req.params.auctionId || '').trim();
    if (!auctionId) {
        res.status(400).json({
            error: 'invalid_auction_id',
            message: 'Path parameter auctionId is required',
        });
        return;
    }
    if (!client_1.hip6Client.isLive()) {
        res.json({
            live: false,
            message: HIP6_NOT_LIVE_MESSAGE,
        });
        return;
    }
    try {
        const auction = await client_1.hip6Client.getAuctionDetails(auctionId);
        if (!auction) {
            res.status(404).json({
                error: 'auction_not_found',
                message: 'No HIP-6 auction found for the provided auctionId',
            });
            return;
        }
        const [bids, clearingHistory] = await Promise.all([
            client_1.hip6Client.getAuctionBids(auctionId),
            client_1.hip6Client.getClearingHistory(auctionId, 200),
        ]);
        const scoreCard = (0, scorer_1.formatScoreCard)((0, scorer_1.scoreAuction)(auction, bids, clearingHistory));
        res.json({
            live: true,
            auction,
            score: scoreCard.score,
            tier: scoreCard.tier,
            factors: scoreCard.factors,
            bidSummary: summarizeBids(bids),
            clearingHistory,
            source: 'hip6',
            updatedAt: new Date().toISOString(),
        });
    }
    catch (error) {
        logger_1.default.error({ err: error, auctionId }, 'Failed to fetch HIP-6 auction deep dive');
        res.status(500).json({
            error: 'hip6_auction_failed',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
router.get('/hip6/clearing/:auctionId', (0, x402Gate_1.createX402Gate)({ price: '$0.01', description: 'Block-by-block clearing events for a HIP-6 auction' }), async (req, res) => {
    const auctionId = String(req.params.auctionId || '').trim();
    if (!auctionId) {
        res.status(400).json({
            error: 'invalid_auction_id',
            message: 'Path parameter auctionId is required',
        });
        return;
    }
    const limit = parseIntegerParam(req.query.limit, 100, 1, 1000);
    if (limit === null) {
        res.status(400).json({
            error: 'invalid_limit',
            message: 'Query parameter limit must be a positive integer',
        });
        return;
    }
    if (!client_1.hip6Client.isLive()) {
        res.json({
            live: false,
            message: HIP6_NOT_LIVE_MESSAGE,
        });
        return;
    }
    try {
        const clearing = await client_1.hip6Client.getClearingHistory(auctionId, limit);
        res.json({
            live: true,
            auctionId,
            clearing,
            count: clearing.length,
            source: 'hip6',
            updatedAt: new Date().toISOString(),
        });
    }
    catch (error) {
        logger_1.default.error({ err: error, auctionId }, 'Failed to fetch HIP-6 clearing history');
        res.status(500).json({
            error: 'hip6_clearing_failed',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
exports.default = router;
//# sourceMappingURL=botindex-hip6.js.map
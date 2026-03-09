"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hip6Client = exports.HIP6Client = void 0;
const logger_1 = __importDefault(require("../../../config/logger"));
const HIP6_CACHE_TTL_MS = 2 * 60 * 1000;
class HIP6Client {
    cache = new Map();
    isLive() {
        return String(process.env.HIP6_LIVE ?? '').toLowerCase() === 'true';
    }
    async getActiveAuctions() {
        logger_1.default.warn('HIP-6 not yet live — returning stub data');
        if (!this.isLive()) {
            return [];
        }
        const cacheKey = 'hip6:auctions:active';
        const cached = this.getFromCache(cacheKey);
        if (cached) {
            return cached;
        }
        // TODO: Query Hyperliquid info endpoint for active HIP-6 auctions.
        const auctions = [];
        this.setCache(cacheKey, auctions);
        return auctions;
    }
    async getAuctionDetails(auctionId) {
        logger_1.default.warn('HIP-6 not yet live — returning stub data');
        if (!this.isLive()) {
            return null;
        }
        const normalizedAuctionId = auctionId.trim();
        const cacheKey = `hip6:auction:details:${normalizedAuctionId}`;
        const cached = this.getFromCache(cacheKey);
        if (cached !== undefined) {
            return cached;
        }
        // TODO: Query Hyperliquid info endpoint for the specific HIP-6 auction.
        const auction = null;
        this.setCache(cacheKey, auction);
        return auction;
    }
    async getAuctionBids(auctionId) {
        logger_1.default.warn('HIP-6 not yet live — returning stub data');
        if (!this.isLive()) {
            return [];
        }
        const normalizedAuctionId = auctionId.trim();
        const cacheKey = `hip6:auction:bids:${normalizedAuctionId}`;
        const cached = this.getFromCache(cacheKey);
        if (cached) {
            return cached;
        }
        // TODO: Query Hyperliquid bid book endpoint for auction bids.
        const bids = [];
        this.setCache(cacheKey, bids);
        return bids;
    }
    async getClearingHistory(auctionId, limit = 100) {
        logger_1.default.warn('HIP-6 not yet live — returning stub data');
        if (!this.isLive()) {
            return [];
        }
        const normalizedAuctionId = auctionId.trim();
        const boundedLimit = Math.max(1, Math.min(1000, Math.floor(limit)));
        const cacheKey = `hip6:auction:clearing:${normalizedAuctionId}:${boundedLimit}`;
        const cached = this.getFromCache(cacheKey);
        if (cached) {
            return cached;
        }
        // TODO: Query Hyperliquid clearing event endpoint for historical auction clears.
        const events = [];
        this.setCache(cacheKey, events);
        return events;
    }
    getFromCache(key) {
        const hit = this.cache.get(key);
        if (!hit) {
            return undefined;
        }
        if (hit.expiresAt <= Date.now()) {
            this.cache.delete(key);
            return undefined;
        }
        return hit.value;
    }
    setCache(key, value) {
        this.cache.set(key, {
            value,
            expiresAt: Date.now() + HIP6_CACHE_TTL_MS,
        });
    }
}
exports.HIP6Client = HIP6Client;
exports.hip6Client = new HIP6Client();
//# sourceMappingURL=client.js.map
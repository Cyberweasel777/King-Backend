"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hip4Client = exports.HIP4Client = void 0;
const logger_1 = __importDefault(require("../../../config/logger"));
const HIP4_CACHE_TTL_MS = 2 * 60 * 1000;
const HIP4_NOT_LIVE_WARNING = 'HIP-4 not yet live on mainnet — returning stub data';
class HIP4Client {
    cache = new Map();
    isLive() {
        return String(process.env.HIP4_LIVE ?? '').toLowerCase() === 'true';
    }
    async getActiveMarkets() {
        if (!this.isLive()) {
            logger_1.default.warn(HIP4_NOT_LIVE_WARNING);
            return [];
        }
        const cacheKey = 'hip4:markets:active';
        const cached = this.getFromCache(cacheKey);
        if (cached) {
            return cached;
        }
        // TODO: Query Hyperliquid info API for active HIP-4 outcome markets.
        const markets = [];
        this.setCache(cacheKey, markets);
        return markets;
    }
    async getMarketDetails(marketId) {
        if (!this.isLive()) {
            logger_1.default.warn(HIP4_NOT_LIVE_WARNING);
            return null;
        }
        const normalizedMarketId = marketId.trim();
        const cacheKey = `hip4:market:details:${normalizedMarketId}`;
        const cached = this.getFromCache(cacheKey);
        if (cached !== undefined) {
            return cached;
        }
        // TODO: Query Hyperliquid info API for a specific HIP-4 outcome market.
        const market = null;
        this.setCache(cacheKey, market);
        return market;
    }
    async getPositions(marketId) {
        if (!this.isLive()) {
            logger_1.default.warn(HIP4_NOT_LIVE_WARNING);
            return [];
        }
        const normalizedMarketId = marketId.trim();
        const cacheKey = `hip4:market:positions:${normalizedMarketId}`;
        const cached = this.getFromCache(cacheKey);
        if (cached) {
            return cached;
        }
        // TODO: Query Hyperliquid positions API for HIP-4 market positions.
        const positions = [];
        this.setCache(cacheKey, positions);
        return positions;
    }
    async getSettlementStatus(marketId) {
        if (!this.isLive()) {
            logger_1.default.warn(HIP4_NOT_LIVE_WARNING);
            return { source: null, contract: null };
        }
        const normalizedMarketId = marketId.trim();
        const cacheKey = `hip4:market:settlement:${normalizedMarketId}`;
        const cached = this.getFromCache(cacheKey);
        if (cached) {
            return cached;
        }
        // TODO: Query Hyperliquid settlement oracle/status API for HIP-4 market settlement state.
        const settlement = { source: null, contract: null };
        this.setCache(cacheKey, settlement);
        return settlement;
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
            expiresAt: Date.now() + HIP4_CACHE_TTL_MS,
        });
    }
}
exports.HIP4Client = HIP4Client;
exports.hip4Client = new HIP4Client();
//# sourceMappingURL=client.js.map
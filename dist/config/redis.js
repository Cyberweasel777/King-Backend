"use strict";
/**
 * Redis Configuration - King Backend
 * Shared Redis connection for caching and queues
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ioredis_1 = __importDefault(require("ioredis"));
const logger_1 = __importDefault(require("./logger"));
const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
    logger_1.default.warn('REDIS_URL not set, using in-memory fallback (not for production)');
}
const redis = redisUrl
    ? new ioredis_1.default(redisUrl, {
        maxRetriesPerRequest: null, // Required for BullMQ
        enableReadyCheck: false,
        retryStrategy(times) {
            const delay = Math.min(times * 50, 2000);
            return delay;
        },
    })
    : new ioredis_1.default(); // Default localhost
redis.on('connect', () => {
    logger_1.default.info('🔗 Redis connected');
});
redis.on('error', (err) => {
    logger_1.default.error('❌ Redis error:', err);
});
redis.on('reconnecting', () => {
    logger_1.default.warn('🔄 Redis reconnecting...');
});
exports.default = redis;
//# sourceMappingURL=redis.js.map
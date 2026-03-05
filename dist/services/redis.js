"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRedis = getRedis;
exports.getCacheKey = getCacheKey;
const ioredis_1 = __importDefault(require("ioredis"));
const logger_1 = require("../utils/logger");
// Shared Redis client
let redisClient = null;
function getRedis() {
    if (!redisClient) {
        const redisUrl = process.env.REDIS_URL;
        redisClient = new ioredis_1.default(redisUrl || 'redis://localhost:6379', {
            retryStrategy: (times) => {
                if (times > 3) {
                    logger_1.logger.error('Redis connection failed after 3 retries');
                    return null;
                }
                return Math.min(times * 100, 3000);
            },
        });
        redisClient.on('connect', () => {
            logger_1.logger.info('Redis connected');
        });
        redisClient.on('error', (err) => {
            logger_1.logger.error({ error: err }, 'Redis error');
        });
    }
    return redisClient;
}
// App-specific cache key
function getCacheKey(appId, key) {
    return `king:${appId}:${key}`;
}
//# sourceMappingURL=redis.js.map
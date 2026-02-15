/**
 * Redis Configuration - King Backend
 * Shared Redis connection for caching and queues
 */

import Redis from 'ioredis';
import logger from './logger';

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  logger.warn('REDIS_URL not set, using in-memory fallback (not for production)');
}

const redis = redisUrl
  ? new Redis(redisUrl, {
      maxRetriesPerRequest: null, // Required for BullMQ
      enableReadyCheck: false,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    })
  : new Redis(); // Default localhost

redis.on('connect', () => {
  logger.info('🔗 Redis connected');
});

redis.on('error', (err) => {
  logger.error('❌ Redis error:', err);
});

redis.on('reconnecting', () => {
  logger.warn('🔄 Redis reconnecting...');
});

export default redis;

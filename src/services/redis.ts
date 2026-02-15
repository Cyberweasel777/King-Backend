import Redis from 'ioredis';
import { logger } from '../utils/logger';

// Shared Redis client
let redisClient: Redis | null = null;

export function getRedis(): Redis {
  if (!redisClient) {
    const redisUrl = process.env.REDIS_URL;

    redisClient = new Redis(redisUrl || 'redis://localhost:6379', {
      retryStrategy: (times: number) => {
        if (times > 3) {
          logger.error('Redis connection failed after 3 retries');
          return null;
        }
        return Math.min(times * 100, 3000);
      },
    });

    redisClient.on('connect', () => {
      logger.info('Redis connected');
    });

    redisClient.on('error', (err: Error) => {
      logger.error({ error: err }, 'Redis error');
    });
  }

  return redisClient;
}

// App-specific cache key
export function getCacheKey(appId: string, key: string): string {
  return `king:${appId}:${key}`;
}

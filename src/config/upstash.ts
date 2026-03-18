/**
 * Upstash Redis — serverless Redis for cross-machine rate limiting + shared state.
 * Free tier: 10K commands/day.
 * Separate from ioredis config (used by BullMQ/pipeline).
 */

import { Redis } from '@upstash/redis';
import logger from './logger';

let upstash: Redis | null = null;

export function initUpstash(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    logger.warn('No UPSTASH_REDIS_REST_URL/TOKEN — Upstash disabled, using in-memory fallback');
    return null;
  }

  upstash = new Redis({ url, token });
  logger.info('Upstash Redis initialized');
  return upstash;
}

export function getUpstash(): Redis | null {
  return upstash;
}

/**
 * Rate limit check using Upstash Redis (works across all Fly machines).
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  if (!upstash) {
    return { allowed: true, remaining: limit, resetAt: 0 };
  }

  const now = Math.floor(Date.now() / 1000);
  const windowKey = `rl:${key}:${Math.floor(now / windowSeconds)}`;

  try {
    const count = await upstash.incr(windowKey);
    if (count === 1) {
      await upstash.expire(windowKey, windowSeconds);
    }

    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      resetAt: (Math.floor(now / windowSeconds) + 1) * windowSeconds,
    };
  } catch (err) {
    logger.error({ err }, 'Upstash rate limit check failed, allowing request');
    return { allowed: true, remaining: limit, resetAt: 0 };
  }
}

export async function incrementCounter(key: string): Promise<number> {
  if (!upstash) return 0;
  try { return await upstash.incr(key); } catch { return 0; }
}

export async function getCounter(key: string): Promise<number> {
  if (!upstash) return 0;
  try { return (await upstash.get<number>(key)) || 0; } catch { return 0; }
}

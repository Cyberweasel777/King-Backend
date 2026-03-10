/**
 * Anonymous (unauthenticated) rate limiter for BotIndex endpoints.
 *
 * Limits unauthenticated requests by IP to push visitors toward
 * API key registration. Authenticated requests (API key or x402) bypass.
 *
 * Default: 3 requests per DAY per IP on gated endpoints.
 * Free API key: 100 req/day (handled in botindex routes).
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import logger from '../../config/logger';

const ANON_DAILY_LIMIT = parseInt(process.env.ANON_RATE_LIMIT || '3', 10);
const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

interface WindowEntry {
  windowStartMs: number;
  count: number;
}

const ipWindows = new Map<string, WindowEntry>();

// Cleanup stale entries every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of ipWindows.entries()) {
    if (now - entry.windowStartMs >= WINDOW_MS * 2) {
      ipWindows.delete(ip);
    }
  }
}, 30 * 60 * 1000);

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0]?.trim() || 'unknown';
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * Rate limit anonymous requests. Place AFTER optionalApiKey middleware.
 * If req.apiKeyAuth is set, or __freeTrialAuthenticated is true, skip.
 *
 * On pass-through, sets __freeTrialAuthenticated = true so downstream
 * x402 gates don't block the request.
 */
export function anonRateLimit(paths: string[]): RequestHandler {
  const pathSet = new Set(paths);

  return (req: Request, res: Response, next: NextFunction) => {
    // Skip if authenticated via API key
    if (req.apiKeyAuth) {
      next();
      return;
    }

    // Skip if free trial authenticated (wallet-based)
    if ((req as any).__freeTrialAuthenticated) {
      next();
      return;
    }

    // Only apply to specified paths
    const matchesPath = pathSet.has(req.path) || 
      Array.from(pathSet).some(p => req.path.startsWith(p));
    if (!matchesPath) {
      next();
      return;
    }

    const ip = getClientIp(req);
    const now = Date.now();

    let entry = ipWindows.get(ip);
    if (!entry || now - entry.windowStartMs >= WINDOW_MS) {
      entry = { windowStartMs: now, count: 0 };
      ipWindows.set(ip, entry);
    }

    entry.count++;

    if (entry.count > ANON_DAILY_LIMIT) {
      const elapsedMs = now - entry.windowStartMs;
      const retryAfterSeconds = Math.max(1, Math.ceil((WINDOW_MS - elapsedMs) / 1000));

      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.setHeader('X-BotIndex-Rate-Limit', String(ANON_DAILY_LIMIT));
      res.setHeader('X-BotIndex-Rate-Remaining', '0');
      res.setHeader('X-BotIndex-Hint', 'Register a free API key for 100 req/day: POST /api/botindex/keys/register');

      logger.info({ ip, count: entry.count, path: req.path }, 'Anon daily rate limit hit');

      res.status(429).json({
        error: 'rate_limited',
        message: `Anonymous access is limited to ${ANON_DAILY_LIMIT} requests per day. Register a free API key for 100 requests/day.`,
        register: {
          url: 'https://king-backend.fly.dev/api/botindex/keys/register',
          method: 'POST',
          body: '{ "email": "you@example.com" }',
          limits: {
            anonymous: `${ANON_DAILY_LIMIT} req/day`,
            free_api_key: '100 req/day',
            pro: 'Unlimited',
          },
        },
        retryAfterSeconds,
      });
      return;
    }

    const remaining = Math.max(0, ANON_DAILY_LIMIT - entry.count);
    res.setHeader('X-BotIndex-Rate-Limit', String(ANON_DAILY_LIMIT));
    res.setHeader('X-BotIndex-Rate-Remaining', String(remaining));
    res.setHeader('X-BotIndex-Hint', 'Register a free API key for 100 req/day: POST /api/botindex/keys/register');

    // Signal downstream x402 gates that this anonymous request is allowed through
    (req as any).__freeTrialAuthenticated = true;

    logger.info({ ip, path: req.path, remaining, isAnon: true }, 'Anonymous API request');

    next();
  };
}

/** Get rate limit stats for admin/monitoring */
export function getAnonRateLimitStats() {
  const now = Date.now();
  let activeIps = 0;
  let limitedIps = 0;

  for (const [, entry] of ipWindows.entries()) {
    if (now - entry.windowStartMs < WINDOW_MS) {
      activeIps++;
      if (entry.count > ANON_DAILY_LIMIT) limitedIps++;
    }
  }

  return { anonDailyLimit: ANON_DAILY_LIMIT, activeIps, limitedIps };
}

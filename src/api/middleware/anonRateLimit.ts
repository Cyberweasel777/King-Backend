/**
 * Anonymous (unauthenticated) rate limiter for BotIndex endpoints.
 *
 * Limits unauthenticated requests by IP to push visitors toward
 * API key registration. Authenticated requests (API key or x402) bypass.
 *
 * Default: 3 requests per hour per IP on gated endpoints.
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import logger from '../../config/logger';

const ANON_HOURLY_LIMIT = parseInt(process.env.ANON_RATE_LIMIT || '3', 10);
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

interface WindowEntry {
  windowStartMs: number;
  count: number;
}

const ipWindows = new Map<string, WindowEntry>();

// Cleanup stale entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of ipWindows.entries()) {
    if (now - entry.windowStartMs >= WINDOW_MS * 2) {
      ipWindows.delete(ip);
    }
  }
}, 10 * 60 * 1000);

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

    if (entry.count > ANON_HOURLY_LIMIT) {
      const elapsedMs = now - entry.windowStartMs;
      const retryAfterSeconds = Math.max(1, Math.ceil((WINDOW_MS - elapsedMs) / 1000));

      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.setHeader('X-BotIndex-Rate-Limit', String(ANON_HOURLY_LIMIT));
      res.setHeader('X-BotIndex-Rate-Remaining', '0');

      logger.info({ ip, count: entry.count, path: req.path }, 'Anon rate limit hit');

      res.status(429).json({
        error: 'rate_limited',
        message: `Free anonymous access is limited to ${ANON_HOURLY_LIMIT} requests per hour. Register for an API key for higher limits.`,
        register: {
          url: 'https://api.botindex.dev/api/botindex/keys/register',
          method: 'POST',
          body: '{ "email": "you@example.com", "plan": "basic" }',
          plans: {
            basic: 'API key with 10 req/hr on premium endpoints',
            pro: 'Unlimited API key access to all endpoints',
          },
        },
        retryAfterSeconds,
      });
      return;
    }

    const remaining = Math.max(0, ANON_HOURLY_LIMIT - entry.count);
    res.setHeader('X-BotIndex-Rate-Limit', String(ANON_HOURLY_LIMIT));
    res.setHeader('X-BotIndex-Rate-Remaining', String(remaining));
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
      if (entry.count > ANON_HOURLY_LIMIT) limitedIps++;
    }
  }

  return { anonHourlyLimit: ANON_HOURLY_LIMIT, activeIps, limitedIps };
}

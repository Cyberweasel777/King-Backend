/**
 * Anonymous (unauthenticated) rate limiter for BotIndex endpoints.
 *
 * Limits unauthenticated requests by IP to push visitors toward
 * API key registration. Authenticated requests (API key or x402) bypass.
 *
 * Default: 3 requests per DAY per IP on gated endpoints.
 * Free API key: 3 req/day (handled in botindex routes).
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import logger from '../../config/logger';
import { buildX402UpgradePayload } from './x402Gate';

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
 * 
 * @param paths - Paths to rate limit
 * @param exclude - Specific sub-paths to exclude (for x402-paid endpoints)
 */
export function anonRateLimit(paths: string[], exclude: string[] = []): RequestHandler {
  const pathSet = new Set(paths);
  const excludeSet = new Set(exclude);

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

    // Skip excluded paths (x402-paid endpoints handle their own access control)
    if (excludeSet.has(req.path) || Array.from(excludeSet).some(p => req.path.startsWith(p))) {
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

    logger.info({ ip, path: req.path, isAnon: true }, 'Anonymous request blocked — API key required');

    const requestUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const x402Upgrade = buildX402UpgradePayload(requestUrl);
    if (x402Upgrade) {
      res.setHeader('payment-required', x402Upgrade.header);
    }

    res.status(401).json({
      error: 'api_key_required',
      message: 'An API key is required to access BotIndex endpoints. Get one free in 10 seconds, or pay per call with x402 (no key needed).',
      get_key: {
        url: 'https://api.botindex.dev/api/botindex/keys/register?plan=free',
        method: 'GET',
        description: 'Free API key — 3 req/day, instant activation.',
      },
      upgrade: {
        pro: {
          url: 'https://api.botindex.dev/api/botindex/keys/register?plan=pro',
          description: 'Pro plan — unlimited requests, $29/mo via Stripe',
        },
        ...(x402Upgrade?.body || {}),
      },
      header: 'X-API-Key: <your-key>',
    });
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

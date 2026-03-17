/**
 * Anonymous (unauthenticated) rate limiter for BotIndex endpoints.
 *
 * Limits unauthenticated requests by IP to push visitors toward
 * API key registration. Authenticated requests (API key or x402) bypass.
 *
 * Default: 10 requests per DAY per IP on gated endpoints.
 * Free API key: 10 req/day (handled in botindex routes).
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import logger from '../../config/logger';
import { buildX402UpgradePayload } from './x402Gate';

const ANON_DAILY_LIMIT = parseInt(process.env.ANON_RATE_LIMIT || '10', 10);
const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const UPGRADE_URL = 'https://api.botindex.dev/api/botindex/keys/register?plan=pro';
const FREE_URL = 'https://api.botindex.dev/api/botindex/keys/register?plan=free';

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

function getUtcMidnightMs(nowMs: number): number {
  const now = new Date(nowMs);
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function getResetInfo(nowMs: number): { resetAtMs: number; resetAtUnix: number; resetAtIso: string; resetsInMs: number } {
  const resetAtMs = getUtcMidnightMs(nowMs) + WINDOW_MS;
  return {
    resetAtMs,
    resetAtUnix: Math.floor(resetAtMs / 1000),
    resetAtIso: new Date(resetAtMs).toISOString(),
    resetsInMs: Math.max(0, resetAtMs - nowMs),
  };
}

function formatDuration(ms: number): string {
  let seconds = Math.floor(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  seconds -= hours * 3600;
  const minutes = Math.floor(seconds / 60);
  seconds -= minutes * 60;

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
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
    const now = Date.now();
    const dayStartMs = getUtcMidnightMs(now);
    const resetInfo = getResetInfo(now);

    const current = ipWindows.get(ip);
    const entry: WindowEntry =
      current && current.windowStartMs === dayStartMs
        ? current
        : { windowStartMs: dayStartMs, count: 0 };
    entry.count += 1;
    ipWindows.set(ip, entry);

    const requestUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const x402Upgrade = buildX402UpgradePayload(requestUrl);
    if (x402Upgrade) {
      res.setHeader('payment-required', x402Upgrade.header);
    }

    const remaining = Math.max(0, ANON_DAILY_LIMIT - entry.count);
    res.setHeader('X-RateLimit-Limit', String(ANON_DAILY_LIMIT));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(resetInfo.resetAtUnix));
    res.setHeader('X-Upgrade-URL', UPGRADE_URL);

    if (entry.count <= ANON_DAILY_LIMIT) {
      logger.info(
        { ip, path: req.path, isAnon: true, used: entry.count, remaining },
        'Anonymous request allowed under daily limit'
      );
      // Mark this request as trial-authenticated so x402-gated routes can proceed.
      (req as any).__freeTrialAuthenticated = true;
      next();
      return;
    }

    logger.info(
      { ip, path: req.path, isAnon: true, used: entry.count, limit: ANON_DAILY_LIMIT },
      'Anonymous request blocked — daily limit exceeded'
    );

    res.status(429).json({
      error: 'daily_limit_exceeded',
      used: entry.count,
      limit: ANON_DAILY_LIMIT,
      resets_in: formatDuration(resetInfo.resetsInMs),
      resets_at: resetInfo.resetAtIso,
      upgrade: {
        url: UPGRADE_URL,
        plan: 'pro',
        price: '$9.99/mo',
        limit: '500/day',
        description: 'BotIndex Pro — 500 requests/day, all endpoints, priority support.',
        ...(x402Upgrade?.body || {}),
      },
      free_key: {
        url: FREE_URL,
        description: 'Or get a free API key for 10 req/day with tracking.',
      },
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

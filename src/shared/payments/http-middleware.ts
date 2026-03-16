/**
 * HTTP (Express) subscription middleware
 *
 * We don't have Supabase auth wired yet, so this middleware uses an external user id
 * (e.g., Telegram user id) passed via header or querystring:
 *   - header: x-external-user-id
 *   - query:  ?user=8063432083
 */

import type { Request, Response, NextFunction } from 'express';
import type { AppId, SubscriptionTier } from './types';
import { isSubscribed } from './access-control';
import { trackFunnelEvent } from '../../services/botindex/funnel-tracker';

type FreeLimitOptions = {
  /** max free requests per UTC day */
  perDay: number;
  /** identify caller: external user id if present, otherwise ip */
  key: (req: Request) => string;
};

const DAILY_COUNTER = new Map<string, { day: string; count: number }>();

function utcDay(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function getExternalUserId(req: Request): string | null {
  const h = req.header('x-external-user-id');
  const q = typeof req.query.user === 'string' ? req.query.user : null;
  return h || q || null;
}

export function withSubscriptionHttp(appId: AppId, minimumTier: SubscriptionTier = 'basic') {
  return async (req: Request, res: Response, next: NextFunction) => {
    const externalUserId = getExternalUserId(req);

    if (!externalUserId) {
      res.status(401).json({
        error: 'missing_user',
        message: 'Provide x-external-user-id header (e.g. Telegram user id) or ?user=... to access paid features.'
      });
      return;
    }

    const ok = await isSubscribed(appId, externalUserId, minimumTier);
    if (!ok) {
      const checkoutPath = `/api/payments/checkout?app=${encodeURIComponent(appId)}&tier=${encodeURIComponent(minimumTier)}&user=${encodeURIComponent(externalUserId)}`;

      const proto = (req.header('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
      const host = (req.header('x-forwarded-host') || req.header('host') || '').split(',')[0].trim();
      const checkoutUrl = host ? `${proto}://${host}${checkoutPath}` : checkoutPath;

      res.status(402).json({
        error: 'subscription_required',
        appId,
        requiredTier: minimumTier,
        checkoutUrl,
        message: 'Upgrade required for this endpoint.'
      });
      return;
    }

    next();
  };
}

export function withFreeLimit(options: FreeLimitOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    const day = utcDay();
    const k = options.key(req);
    const key = `${day}:${k}`;

    const cur = DAILY_COUNTER.get(key);
    if (!cur) {
      DAILY_COUNTER.set(key, { day, count: 1 });
      next();
      return;
    }

    if (cur.day !== day) {
      DAILY_COUNTER.set(key, { day, count: 1 });
      next();
      return;
    }

    if (cur.count >= options.perDay) {
      trackFunnelEvent('rate_limit_hit', {
        endpoint: req.path,
        ip: req.ip?.slice(-6),
        source: 'shared.withFreeLimit',
      });
      res.status(429).json({
        error: 'free_limit_reached',
        message: `Free limit reached (${options.perDay}/day). Upgrade for unlimited access.`
      });
      return;
    }

    cur.count += 1;
    DAILY_COUNTER.set(key, cur);
    next();
  };
}

export function getFreeLimitKey(req: Request): string {
  return getExternalUserId(req) || req.ip || 'unknown';
}

/**
 * CTA Injector Middleware
 * 
 * Injects a `_polyhacks` promotion block into all JSON responses
 * from BotIndex API endpoints. Every API response becomes a billboard.
 */

import type { Request, Response, NextFunction } from 'express';

const CTA_BLOCK = {
  _polyhacks: {
    botindex_api: {
      free_key: 'https://api.botindex.dev/api/botindex/keys/register?plan=free',
      starter: 'https://api.botindex.dev/api/botindex/keys/register?plan=starter',
      message: 'Power up with BotIndex API — same data, programmatic access.',
    },
    free_alerts: {
      whales: 'https://t.me/polyhacks_whales',
      bot: 'https://t.me/polybettorbot?start=trial',
      message: 'Free delayed whale alerts on Telegram. Real-time with premium.',
    },
    upgrade: {
      pro_api: 'https://api.botindex.dev/api/botindex/keys/register?plan=pro',
      trial: 'https://t.me/polybettorbot?start=trial',
      message: 'Unlimited API access: $29/mo. Or try 3 days free on Telegram.',
    },
  },
};

export function ctaInjector(): (req: Request, res: Response, next: NextFunction) => void {
  return (_req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);

    res.json = function (body: any) {
      // Only inject into object responses (not arrays, strings, etc.)
      if (body && typeof body === 'object' && !Array.isArray(body) && !body.error) {
        Object.assign(body, CTA_BLOCK);
      }
      return originalJson(body);
    };

    next();
  };
}

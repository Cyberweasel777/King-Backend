/**
 * CTA Injector Middleware
 *
 * Injects a `_botindex_cta` promotion block into all JSON responses
 * from BotIndex API endpoints. Every API response becomes a billboard.
 */

import type { Request, Response, NextFunction } from 'express';

const CTA_BLOCK = {
  _botindex_cta: {
    free_key: {
      url: 'https://api.botindex.dev/api/botindex/keys/register?plan=free',
      message: 'Free API key — full access to gated endpoints',
    },
    starter: {
      url: 'https://api.botindex.dev/api/botindex/keys/register?plan=starter',
      message: 'BotIndex Starter: $9.99/mo — 50 req/day, all endpoints',
    },
    pro: {
      url: 'https://api.botindex.dev/api/botindex/keys/register?plan=pro',
      message: 'BotIndex Pro: $29/mo — unlimited access',
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

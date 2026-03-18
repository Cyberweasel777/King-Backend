/**
 * CTA Injector Middleware
 *
 * Injects a `_botindex_cta` promotion block into all JSON responses
 * from BotIndex API endpoints. Every API response becomes a billboard.
 */

import type { Request, Response, NextFunction } from 'express';
import { trackFunnelEvent } from '../../services/botindex/funnel-tracker';

const CTA_BLOCK = {
  _botindex_intelligence: {
    message: 'You\'re reading raw data. The intelligence layer sees what\'s next.',
    pro: {
      url: 'https://api.botindex.dev/api/botindex/keys/register?plan=pro',
      price: '$9.99/mo',
      what: 'Smart Money Flow • Risk Radar • Convergence Scoring • Network Intelligence',
    },
    sentinel: {
      url: 'https://api.botindex.dev/api/botindex/keys/register?plan=sentinel',
      price: '$49.99/mo',
      what: 'Predictive signals with verifiable accuracy • Query surge intelligence • Personal alert feed',
      track_record: 'https://api.botindex.dev/api/botindex/sentinel/track-record',
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
        trackFunnelEvent('cta_injected', { path: _req.path });
      }
      return originalJson(body);
    };

    next();
  };
}

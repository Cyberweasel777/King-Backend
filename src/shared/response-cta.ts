/**
 * Standardized CTA block injected into every API response.
 * Agents parse JSON — this is a billboard inside the data payload.
 */

const FREE_KEY_URL = 'https://api.botindex.dev/api/botindex/keys/register?plan=free';
const PRO_URL = 'https://api.botindex.dev/api/botindex/keys/register?plan=pro';

export interface ResponseCTA {
  free_key: string;
  upgrade: string;
  telegram: {
    whale_alerts: string;
    zora_alpha: string;
    message: string;
  };
  intelligence_teaser?: string;
}

/**
 * Build a CTA block for free (unauthenticated) endpoint responses.
 * @param intelligenceTeaser - A one-line teaser of what DeepSeek would say about THIS data.
 */
export function buildFreeCTA(intelligenceTeaser?: string): { _cta: ResponseCTA } {
  return {
    _cta: {
      free_key: `${FREE_KEY_URL} — Get your free API key (no credit card)`,
      upgrade: `${PRO_URL} — Pro $9.99/mo: 500 req/day, full DeepSeek analysis`,
      telegram: {
        whale_alerts: 'https://t.me/polyhacks_whales — Free whale position alerts (delayed 15min)',
        zora_alpha: 'https://t.me/ZoraAlpha — Free Zora trending coin alerts',
        message: 'Get alerts on Telegram — no signup needed, just /start',
      },
      ...(intelligenceTeaser ? { intelligence_teaser: intelligenceTeaser } : {}),
    },
  };
}

/**
 * Build a CTA block for authenticated free-tier responses (they have a key but not paid).
 */
export function buildAuthenticatedCTA(intelligenceTeaser?: string): { _cta: ResponseCTA } {
  return {
    _cta: {
      free_key: 'You have a key — you\'re in.',
      upgrade: `${PRO_URL} — Upgrade to Pro: 500 req/day, full DeepSeek analysis`,
      telegram: {
        whale_alerts: 'https://t.me/polyhacks_whales — Free whale alerts on Telegram',
        zora_alpha: 'https://t.me/ZoraAlpha — Free Zora trending coin alerts',
        message: 'Real-time alerts on Telegram while you build.',
      },
      ...(intelligenceTeaser ? { intelligence_teaser: intelligenceTeaser } : {}),
    },
  };
}

/**
 * Build a minimal CTA for paid-tier responses (just cross-sell Telegram).
 */
export function buildPaidCTA(): { _cta: Pick<ResponseCTA, 'telegram'> } {
  return {
    _cta: {
      telegram: {
        whale_alerts: 'https://t.me/polyhacks_whales — Real-time whale alerts',
        zora_alpha: 'https://t.me/ZoraAlpha — Zora trending coin alerts',
        message: 'Get push notifications for market moves.',
      },
    },
  };
}

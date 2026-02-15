/**
 * Global payments routes
 *
 * Minimal checkout URL creator for canary.
 * Mounted at /api/payments
 *
 * GET /api/payments/checkout?app=<botindex|memeradar|arbwatch>&tier=<basic|pro>&user=<externalUserId>
 * Returns: { url }
 */

import { Router, type Request, type Response } from 'express';
import type { AppId, SubscriptionTier } from '../../shared/payments/types';
import { createCheckoutSession } from '../../shared/payments/stripe-client';
import { isStripeConfigured } from '../../shared/payments/config';

const router = Router();

const CANARY_APPS: AppId[] = ['botindex', 'memeradar', 'arbwatch'];

function getExternalUserId(req: Request): string | null {
  const h = req.header('x-external-user-id');
  const q = typeof req.query.user === 'string' ? req.query.user : null;
  return h || q || null;
}

function getBaseUrl(req: Request): string {
  // Prefer Fly/Proxy headers when present
  const proto = (req.header('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
  const host = (req.header('x-forwarded-host') || req.header('host') || '').split(',')[0].trim();
  if (!host) return '';
  return `${proto}://${host}`;
}

router.get('/checkout', async (req: Request, res: Response) => {
  const app = req.query.app;
  const tier = req.query.tier;
  const externalUserId = getExternalUserId(req);
  const email = typeof req.query.email === 'string' ? req.query.email : undefined;

  if (typeof app !== 'string' || typeof tier !== 'string') {
    return res.status(400).json({
      error: 'missing_params',
      message: 'Required query params: app, tier. Optional: user (or x-external-user-id header), email',
    });
  }

  const appId = app as AppId;
  if (!CANARY_APPS.includes(appId)) {
    return res.status(400).json({ error: 'invalid_app', message: `Invalid app. Allowed: ${CANARY_APPS.join(', ')}` });
  }

  const subscriptionTier = tier as SubscriptionTier;
  if (subscriptionTier !== 'basic' && subscriptionTier !== 'pro') {
    return res.status(400).json({ error: 'invalid_tier', message: 'tier must be basic or pro' });
  }

  if (!externalUserId) {
    return res.status(401).json({
      error: 'missing_user',
      message: 'Provide x-external-user-id header (e.g. Telegram user id) or ?user=... to create a checkout session.',
    });
  }

  if (!isStripeConfigured(appId)) {
    return res.status(503).json({
      error: 'stripe_not_configured',
      message: `Stripe is not configured for ${appId}. Set STRIPE_SECRET_KEY and STRIPE_PRICE_ID_* env vars for this app.`,
    });
  }

  const baseUrl = getBaseUrl(req);
  const successUrl =
    (typeof req.query.successUrl === 'string' && req.query.successUrl) ||
    process.env.PAYMENTS_CHECKOUT_SUCCESS_URL ||
    (baseUrl ? `${baseUrl}/api/payments/checkout/success?app=${encodeURIComponent(appId)}` : undefined);

  const cancelUrl =
    (typeof req.query.cancelUrl === 'string' && req.query.cancelUrl) ||
    process.env.PAYMENTS_CHECKOUT_CANCEL_URL ||
    (baseUrl ? `${baseUrl}/api/payments/checkout/cancel?app=${encodeURIComponent(appId)}` : undefined);

  if (!successUrl || !cancelUrl) {
    return res.status(500).json({
      error: 'missing_redirect_urls',
      message:
        'Unable to determine success/cancel URLs. Provide ?successUrl=...&cancelUrl=... or set PAYMENTS_CHECKOUT_SUCCESS_URL / PAYMENTS_CHECKOUT_CANCEL_URL.',
    });
  }

  try {
    const session = await createCheckoutSession(appId, {
      externalUserId,
      tier: subscriptionTier,
      successUrl,
      cancelUrl,
      email,
      metadata: {
        source: 'king-backend',
      },
    });

    return res.json({ url: session.url });
  } catch (err: any) {
    return res.status(500).json({ error: 'checkout_failed', message: err?.message || 'Checkout failed' });
  }
});

router.get('/checkout/success', (req, res) => {
  res.type('text/plain').send('Checkout success. You can close this window.');
});

router.get('/checkout/cancel', (req, res) => {
  res.type('text/plain').send('Checkout canceled. You can close this window.');
});

export default router;

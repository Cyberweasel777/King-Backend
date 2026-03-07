import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { z } from 'zod';
import logger from '../../config/logger';
import {
  BotIndexApiPlan,
  createApiKeyEntry,
  generateApiKey,
  getApiKeyEntry,
  requireApiKey,
} from '../middleware/apiKeyAuth';
import { getFunnelStats, trackFunnelEvent } from '../../services/botindex/conversion-funnel';
import { sendApiKeyEmail } from '../../services/botindex/key-delivery-email';

const router = Router();

const SUCCESS_URL = 'https://api.botindex.dev/api/botindex/keys/success?session_id={CHECKOUT_SESSION_ID}';
const CANCEL_URL = 'https://api.botindex.dev/api/botindex/keys/cancel';
const PORTAL_RETURN_URL = 'https://api.botindex.dev/api/botindex/keys/cancel';
const ADMIN_ID = process.env.ADMIN_ID || '8063432083';

const registerSchema = z.object({
  email: z.string().email(),
  plan: z.enum(['basic', 'pro']).optional(),
});

function getStripeClient(): Stripe {
  const stripeSecretKey = process.env.BOTINDEX_STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    throw new Error('BOTINDEX_STRIPE_SECRET_KEY is not configured');
  }

  return new Stripe(stripeSecretKey, { apiVersion: '2025-02-24.acacia' });
}

function getPlanPriceId(plan: BotIndexApiPlan): string {
  const basic = process.env.BOTINDEX_STRIPE_PRICE_BASIC;
  const pro = process.env.BOTINDEX_STRIPE_PRICE_PRO;
  const byPlan: Record<BotIndexApiPlan, string | undefined> = {
    free: undefined,
    basic,
    pro,
  };

  const priceId = byPlan[plan];
  if (!priceId) {
    throw new Error(`Missing Stripe price ID for plan "${plan}"`);
  }
  return priceId;
}

function resolvePlanFromSession(session: Stripe.Checkout.Session): BotIndexApiPlan {
  const plan = session.metadata?.plan;
  if (plan === 'pro') return 'pro';
  if (plan === 'basic') return 'basic';
  return 'basic';
}

async function resolveEmailFromSession(stripe: Stripe, session: Stripe.Checkout.Session): Promise<string | null> {
  const fromSession = session.customer_details?.email || session.metadata?.email;
  if (fromSession) return fromSession;

  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
  if (!customerId) return null;

  const customer = await stripe.customers.retrieve(customerId);
  if (typeof customer === 'string' || customer.deleted) {
    return null;
  }
  return customer.email || null;
}

// GET /register — browser-friendly: redirects straight to Stripe Checkout
router.get('/register', async (req: Request, res: Response) => {
  try {
    const planParam = req.query.plan;
    const plan: BotIndexApiPlan = (planParam === 'free') ? 'free' : (planParam === 'pro') ? 'pro' : 'basic';

    if (plan === 'free') {
      trackFunnelEvent('register_page_hit', 'free');
      trackFunnelEvent('checkout_completed', 'free');

      const apiKey = generateApiKey();
      createApiKeyEntry({
        apiKey,
        email: 'free-tier@botindex.dev',
        plan: 'free',
      });
      trackFunnelEvent('api_key_issued', 'free');

      res.json({
        apiKey,
        plan: 'free',
        rateLimit: '3 req/hr',
        message: "Free tier API key. Save this - it won't be shown again.",
      });
      return;
    }

    const stripe = getStripeClient();
    const priceId = getPlanPriceId(plan);

    trackFunnelEvent('register_page_hit', plan);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: SUCCESS_URL,
      cancel_url: CANCEL_URL,
      metadata: { plan },
    });

    if (!session.url) {
      res.status(500).json({ error: 'checkout_session_failed', message: 'Stripe did not return a checkout URL' });
      return;
    }

    trackFunnelEvent('checkout_session_created', plan);
    res.redirect(303, session.url);
  } catch (error) {
    logger.error({ err: error }, 'Failed to create BotIndex key checkout session (GET)');
    res.status(500).json({ error: 'checkout_session_failed', message: 'Unable to create checkout session' });
  }
});

// POST /register — API-friendly: returns JSON with checkout URL
router.post('/register', async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'invalid_payload',
      message: parsed.error.issues[0]?.message || 'Invalid registration payload',
    });
    return;
  }

  try {
    const stripe = getStripeClient();
    const plan: BotIndexApiPlan = parsed.data.plan || 'basic';
    const priceId = getPlanPriceId(plan);

    trackFunnelEvent('register_page_hit', plan);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: parsed.data.email,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: SUCCESS_URL,
      cancel_url: CANCEL_URL,
      metadata: {
        email: parsed.data.email,
        plan,
      },
    });

    if (!session.url) {
      res.status(500).json({ error: 'checkout_session_failed', message: 'Stripe did not return a checkout URL' });
      return;
    }

    trackFunnelEvent('checkout_session_created', plan);

    res.json({
      checkoutUrl: session.url,
      sessionId: session.id,
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to create BotIndex key checkout session');
    res.status(500).json({ error: 'checkout_session_failed', message: 'Unable to create checkout session' });
  }
});

router.get('/success', async (req: Request, res: Response) => {
  const sessionId = typeof req.query.session_id === 'string' ? req.query.session_id : '';
  if (!sessionId) {
    res.status(400).json({ error: 'missing_session_id', message: 'session_id query parameter is required' });
    return;
  }

  try {
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;

    if (!customerId) {
      res.status(400).json({ error: 'invalid_session', message: 'Checkout session has no Stripe customer' });
      return;
    }

    if (session.status !== 'complete') {
      res.status(400).json({ error: 'checkout_incomplete', message: 'Checkout session is not complete' });
      return;
    }

    const email = await resolveEmailFromSession(stripe, session);
    if (!email) {
      res.status(400).json({ error: 'missing_email', message: 'No customer email found for checkout session' });
      return;
    }

    const plan = resolvePlanFromSession(session);
    trackFunnelEvent('checkout_completed', plan);

    const apiKey = generateApiKey();
    createApiKeyEntry({
      apiKey,
      email,
      stripeCustomerId: customerId,
      plan,
    });
    trackFunnelEvent('api_key_issued', plan);

    try {
      await sendApiKeyEmail({ to: email, apiKey, plan });
    } catch (emailError) {
      logger.error({ err: emailError, email }, 'Failed to send BotIndex API key email');
    }

    res.json({
      apiKey,
      plan,
      message: "Save this key - it won't be shown again",
    });
  } catch (error) {
    logger.error({ err: error, sessionId }, 'Failed to finalize BotIndex key checkout session');
    res.status(500).json({ error: 'session_finalize_failed', message: 'Unable to finalize checkout session' });
  }
});

router.get('/info', requireApiKey, (req: Request, res: Response) => {
  const auth = req.apiKeyAuth;
  if (!auth) {
    res.status(401).json({ error: 'invalid_api_key', message: 'Valid X-API-Key header is required.' });
    return;
  }

  const entry = getApiKeyEntry(auth.apiKey);
  if (!entry) {
    res.status(401).json({ error: 'invalid_api_key', message: 'Valid X-API-Key header is required.' });
    return;
  }

  res.json({
    plan: entry.plan,
    requestCount: entry.requestCount,
    createdAt: entry.createdAt,
    status: entry.status,
  });
});

router.post('/portal', requireApiKey, async (req: Request, res: Response) => {
  const auth = req.apiKeyAuth;
  if (!auth) {
    res.status(401).json({ error: 'invalid_api_key', message: 'Valid X-API-Key header is required.' });
    return;
  }

  const entry = getApiKeyEntry(auth.apiKey);
  if (!entry) {
    res.status(401).json({ error: 'invalid_api_key', message: 'Valid X-API-Key header is required.' });
    return;
  }

  if (!entry.stripeCustomerId) {
    res.status(400).json({ error: 'missing_customer', message: 'No Stripe customer associated with this API key' });
    return;
  }

  try {
    const stripe = getStripeClient();
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: entry.stripeCustomerId,
      return_url: PORTAL_RETURN_URL,
    });

    res.json({ portalUrl: portalSession.url });
  } catch (error) {
    logger.error({ err: error, apiKey: auth.apiKey }, 'Failed to create BotIndex billing portal session');
    res.status(500).json({ error: 'portal_session_failed', message: 'Unable to create billing portal session' });
  }
});

router.get('/admin/funnel', (req: Request, res: Response) => {
  const adminId = typeof req.query.adminId === 'string' ? req.query.adminId : '';
  if (adminId !== ADMIN_ID) {
    res.status(403).json({ error: 'forbidden', message: 'Invalid adminId' });
    return;
  }

  res.json(getFunnelStats());
});

router.get('/cancel', (_req: Request, res: Response) => {
  res.json({ message: 'Checkout cancelled. Return to API docs to try again.' });
});

export default router;

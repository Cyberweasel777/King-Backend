import { Request, Response, Router } from 'express';
import Stripe from 'stripe';
import logger from '../../config/logger';
import {
  findZoraAlphaSubscriberByStripeCustomerId,
  mapStripeStatusToSubscriberStatus,
  upsertZoraAlphaSubscriber,
} from '../../services/botindex/zora/subscriber-store';

const router = Router();

function getStripeClient(): Stripe {
  const secretKey = process.env.BOTINDEX_STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('BOTINDEX_STRIPE_SECRET_KEY is not configured');
  }
  return new Stripe(secretKey, { apiVersion: '2025-02-24.acacia' });
}

function getWebhookSecret(): string {
  const secret = process.env.ZORA_ALPHA_STRIPE_WEBHOOK_SECRET || process.env.BOTINDEX_STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('ZORA_ALPHA_STRIPE_WEBHOOK_SECRET is not configured');
  }
  return secret;
}

function toIsoFromUnixSeconds(value?: number | null): string | undefined {
  if (!value || !Number.isFinite(value)) return undefined;
  return new Date(value * 1000).toISOString();
}

async function sendActivationDm(chatId: number, status: 'trial' | 'active'): Promise<void> {
  const botToken = process.env.ZORA_ALPHA_BOT_TOKEN || '';
  if (!botToken) {
    logger.warn({ chatId }, 'Activation DM skipped: ZORA_ALPHA_BOT_TOKEN not configured');
    return;
  }

  const text =
    status === 'trial'
      ? '✅ Your 7-day Zora Alpha Premium trial is active. Real-time alerts are now unlocked in your DMs.'
      : '✅ Your Zora Alpha Premium subscription is active. Real-time alerts are now unlocked in your DMs.';

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });

  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.ok) {
    const detail = payload?.description || `${response.status} ${response.statusText}`;
    throw new Error(`Activation DM failed: ${detail}`);
  }
}

async function handleCheckoutSessionCompleted(
  stripe: Stripe,
  session: Stripe.Checkout.Session
): Promise<void> {
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
  const subscriptionId =
    typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
  const metadata = session.metadata || {};

  let telegramUserId = metadata.telegram_user_id || '';
  let chatId = Number.parseInt(metadata.telegram_chat_id || '', 10);

  if (customerId && (!telegramUserId || !Number.isFinite(chatId))) {
    const byCustomer = await findZoraAlphaSubscriberByStripeCustomerId(customerId);
    if (byCustomer) {
      if (!telegramUserId) telegramUserId = byCustomer.telegramUserId;
      if (!Number.isFinite(chatId)) chatId = byCustomer.subscriber.chatId;
    }
  }

  if (!telegramUserId || !Number.isFinite(chatId)) {
    logger.warn(
      {
        sessionId: session.id,
        customerId,
        metadata,
      },
      'Checkout completed event missing Telegram identifiers'
    );
    return;
  }

  let status: 'trial' | 'active' | 'expired' | 'cancelled' = 'trial';
  let expiresAt: string | undefined;
  if (subscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    status = mapStripeStatusToSubscriberStatus(subscription.status);
    expiresAt = toIsoFromUnixSeconds(subscription.current_period_end || subscription.trial_end);
  }

  let previousStatus: 'trial' | 'active' | 'expired' | 'cancelled' | null = null;
  await upsertZoraAlphaSubscriber(telegramUserId, (existing) => {
    previousStatus = existing?.status || null;
    return {
      chatId,
      status,
      stripeCustomerId: customerId || existing?.stripeCustomerId,
      subscribedAt: existing?.subscribedAt || new Date().toISOString(),
      expiresAt: expiresAt || existing?.expiresAt,
    };
  });

  if (
    (status === 'trial' || status === 'active') &&
    previousStatus !== 'trial' &&
    previousStatus !== 'active'
  ) {
    await sendActivationDm(chatId, status);
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
  if (!customerId) return;

  const found = await findZoraAlphaSubscriberByStripeCustomerId(customerId);
  if (!found) {
    logger.warn({ customerId }, 'No Zora Alpha subscriber matched Stripe customer for update event');
    return;
  }

  const status = mapStripeStatusToSubscriberStatus(subscription.status);
  const expiresAt = toIsoFromUnixSeconds(subscription.current_period_end || subscription.trial_end);
  let previousStatus: 'trial' | 'active' | 'expired' | 'cancelled' | null = null;

  await upsertZoraAlphaSubscriber(found.telegramUserId, (existing) => {
    previousStatus = existing?.status || null;
    return {
      chatId: existing?.chatId || found.subscriber.chatId,
      status,
      stripeCustomerId: customerId,
      subscribedAt: existing?.subscribedAt || found.subscriber.subscribedAt || new Date().toISOString(),
      expiresAt,
    };
  });

  if (
    (status === 'trial' || status === 'active') &&
    previousStatus !== 'trial' &&
    previousStatus !== 'active'
  ) {
    await sendActivationDm(found.subscriber.chatId, status);
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
  if (!customerId) return;

  const found = await findZoraAlphaSubscriberByStripeCustomerId(customerId);
  if (!found) return;

  await upsertZoraAlphaSubscriber(found.telegramUserId, (existing) => ({
    chatId: existing?.chatId || found.subscriber.chatId,
    status: 'cancelled',
    stripeCustomerId: customerId,
    subscribedAt: existing?.subscribedAt || found.subscriber.subscribedAt || new Date().toISOString(),
    expiresAt: toIsoFromUnixSeconds(subscription.current_period_end) || new Date().toISOString(),
  }));
}

router.post('/zora/bot/stripe-webhook', async (req: Request, res: Response) => {
  const signature = req.headers['stripe-signature'];
  if (!signature || typeof signature !== 'string') {
    res.status(400).json({ error: 'missing_signature', message: 'Missing stripe-signature header' });
    return;
  }

  const rawBody =
    req.body instanceof Buffer ? req.body : Buffer.from(typeof req.body === 'string' ? req.body : '');
  if (!rawBody.length) {
    res.status(400).json({ error: 'invalid_payload', message: 'Expected raw webhook payload' });
    return;
  }

  let event: Stripe.Event;
  let stripe: Stripe;

  try {
    stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(rawBody, signature, getWebhookSecret());
  } catch (error) {
    logger.error({ err: error }, 'Zora Alpha Stripe webhook signature verification failed');
    res.status(400).json({ error: 'invalid_signature' });
    return;
  }

  try {
    if (event.type === 'checkout.session.completed') {
      await handleCheckoutSessionCompleted(stripe, event.data.object as Stripe.Checkout.Session);
    } else if (event.type === 'customer.subscription.updated') {
      await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
    } else if (event.type === 'customer.subscription.deleted') {
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
    }
  } catch (error) {
    logger.error({ err: error, eventType: event.type, eventId: event.id }, 'Zora Alpha webhook handling failed');
    res.status(200).json({ received: true, processed: false });
    return;
  }

  res.json({ received: true, processed: true });
});

export default router;

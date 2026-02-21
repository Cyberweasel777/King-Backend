/**
 * Stripe Webhook Handler
 * Processes Stripe events and updates subscriptions
 */

import Stripe from 'stripe';
import { AppId, SubscriptionTier, SubscriptionStatus } from './types';
import {
  getStripeWebhookSecret,
  getStripeSecretKey,
} from './config';
import { 
  upsertSubscription, 
  updateSubscriptionFromStripe,
  recordPaymentEvent,
  getSubscriptionByStripeCustomer,
  recordReferralConversion,
} from './database';
import { sendMetaCapiEvent } from './meta-capi';

/**
 * Verify and parse Stripe webhook payload
 */
export function verifyWebhookPayload(
  appId: AppId,
  payload: string | Buffer,
  signature: string
): Stripe.Event | null {
  const secret = getStripeWebhookSecret(appId);
  if (!secret) {
    console.error(`No webhook secret for ${appId}`);
    return null;
  }

  const secretKey = getStripeSecretKey(appId);
  if (!secretKey) return null;

  const stripe = new Stripe(secretKey, { apiVersion: '2025-02-24.acacia' });

  try {
    return stripe.webhooks.constructEvent(payload, signature, secret);
  } catch (err: any) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return null;
  }
}

/**
 * Handle Stripe webhook event
 */
export async function handleWebhookEvent(
  appId: AppId,
  event: Stripe.Event
): Promise<{ processed: boolean; message: string }> {
  // Record event first (for audit/metrics)
  const tier = extractTierFromEvent(event);
  const amount = extractAmountFromEvent(event);
  const currency = extractCurrencyFromEvent(event);
  
  // Record the event (idempotent)
  await recordPaymentEvent({
    appId,
    eventType: event.type,
    stripeEventId: event.id,
    externalUserId: extractExternalUserId(event),
    amount,
    currency,
    tier,
    metadata: {
      stripe_event_type: event.type,
      ...event.data.object,
    },
  });

  switch (event.type) {
    case 'checkout.session.completed':
      return handleCheckoutCompleted(appId, event);

    case 'invoice.payment_succeeded':
      return handleInvoicePaymentSucceeded(appId, event);

    case 'invoice.payment_failed':
      return handleInvoicePaymentFailed(appId, event);

    case 'customer.subscription.deleted':
      return handleSubscriptionDeleted(appId, event);

    case 'customer.subscription.updated':
      return handleSubscriptionUpdated(appId, event);

    default:
      return { processed: false, message: `Unhandled event type: ${event.type}` };
  }
}

/**
 * Handle checkout.session.completed
 * New subscription started
 */
async function handleCheckoutCompleted(
  appId: AppId,
  event: Stripe.Event
): Promise<{ processed: boolean; message: string }> {
  const session = event.data.object as Stripe.Checkout.Session;
  
  const externalUserId = session.metadata?.external_user_id;
  const tier = session.metadata?.tier as SubscriptionTier;
  
  if (!externalUserId || !tier) {
    return { processed: false, message: 'Missing metadata in checkout session' };
  }

  // Get subscription details
  const stripeSubId = session.subscription as string;
  const stripeCustomerId = session.customer as string;

  // Update database
  await upsertSubscription(appId, externalUserId, {
    stripeCustomerId,
    stripeSubscriptionId: stripeSubId,
    tier,
    status: 'active',
  });

  // Capture referral conversion when present
  const referralCode = session.metadata?.referral_code;
  if (referralCode) {
    await recordReferralConversion({
      appId,
      referralCode,
      referredExternalUserId: externalUserId,
      checkoutSessionId: session.id,
      stripeCustomerId,
      stripeSubscriptionId: stripeSubId,
      rewardMonths: 1,
      payoutCents: 0,
      metadata: { tier },
    });
  }

  // Send Meta CAPI event (optional)
  if (session.customer_details?.email) {
    await sendMetaCapiEvent(appId, {
      eventName: 'Purchase',
      externalUserId,
      email: session.customer_details.email,
      value: extractAmountFromEvent(event),
      currency: extractCurrencyFromEvent(event),
    });
  }

  return { processed: true, message: `Subscription created: ${tier}` };
}

/**
 * Handle invoice.payment_succeeded
 * Recurring payment received
 */
async function handleInvoicePaymentSucceeded(
  appId: AppId,
  event: Stripe.Event
): Promise<{ processed: boolean; message: string }> {
  const invoice = event.data.object as Stripe.Invoice;
  
  const stripeCustomerId = invoice.customer as string;
  const stripeSubId = invoice.subscription as string;
  
  // Get subscription to find external_user_id
  const existingSub = await getSubscriptionByStripeCustomer(stripeCustomerId);
  
  if (!existingSub) {
    return { processed: false, message: 'Subscription not found' };
  }

  // Check if this is the first invoice (skip to avoid double-counting)
  const isFirstInvoice = invoice.billing_reason === 'subscription_create';
  
  if (!isFirstInvoice) {
    // Update period end
    await updateSubscriptionFromStripe(stripeCustomerId, {
      status: 'active',
    });

    // Send Meta CAPI event for recurring
    if (existingSub) {
      await sendMetaCapiEvent(appId, {
        eventName: 'Purchase',
        externalUserId: existingSub.externalUserId,
        value: extractAmountFromEvent(event),
        currency: extractCurrencyFromEvent(event),
      });
    }
  }

  return { 
    processed: true, 
    message: isFirstInvoice ? 'First invoice - skipped' : 'Recurring payment recorded' 
  };
}

/**
 * Handle invoice.payment_failed
 * Payment failed - mark as past_due
 */
async function handleInvoicePaymentFailed(
  appId: AppId,
  event: Stripe.Event
): Promise<{ processed: boolean; message: string }> {
  const invoice = event.data.object as Stripe.Invoice;
  const stripeCustomerId = invoice.customer as string;
  
  await updateSubscriptionFromStripe(stripeCustomerId, {
    status: 'past_due',
  });

  return { processed: true, message: 'Subscription marked past_due' };
}

/**
 * Handle customer.subscription.deleted
 * Subscription canceled
 */
async function handleSubscriptionDeleted(
  appId: AppId,
  event: Stripe.Event
): Promise<{ processed: boolean; message: string }> {
  const subscription = event.data.object as Stripe.Subscription;
  const stripeCustomerId = subscription.customer as string;
  
  await updateSubscriptionFromStripe(stripeCustomerId, {
    tier: 'free',
    status: 'canceled',
    stripeSubscriptionId: undefined,
    currentPeriodEnd: undefined,
  });

  return { processed: true, message: 'Subscription canceled' };
}

/**
 * Handle customer.subscription.updated
 * Subscription changed (tier, status, etc)
 */
async function handleSubscriptionUpdated(
  appId: AppId,
  event: Stripe.Event
): Promise<{ processed: boolean; message: string }> {
  const subscription = event.data.object as Stripe.Subscription;
  const stripeCustomerId = subscription.customer as string;
  
  const status = mapStripeStatus(subscription.status);
  const periodEnd = subscription.current_period_end 
    ? new Date(subscription.current_period_end * 1000) 
    : undefined;

  await updateSubscriptionFromStripe(stripeCustomerId, {
    status,
    currentPeriodEnd: periodEnd,
  });

  return { processed: true, message: 'Subscription updated' };
}

// Helpers
function extractExternalUserId(event: Stripe.Event): string | undefined {
  const obj = event.data.object as any;
  return obj.metadata?.external_user_id || 
         obj.customer_details?.external_user_id ||
         obj.customer?.metadata?.external_user_id;
}

function extractTierFromEvent(event: Stripe.Event): SubscriptionTier | undefined {
  const obj = event.data.object as any;
  return obj.metadata?.tier || 
         obj.subscription_details?.metadata?.tier;
}

function extractAmountFromEvent(event: Stripe.Event): number | undefined {
  const obj = event.data.object as any;
  return obj.amount_total || 
         obj.amount_paid || 
         obj.amount;
}

function extractCurrencyFromEvent(event: Stripe.Event): string | undefined {
  const obj = event.data.object as any;
  return obj.currency;
}

function mapStripeStatus(stripeStatus: string): SubscriptionStatus {
  switch (stripeStatus) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    case 'canceled':
    case 'incomplete_expired':
      return 'canceled';
    default:
      return 'inactive';
  }
}

function getAppIdFromEnv(appId: string): AppId | null {
  const validApps: AppId[] = [
    'spreadhunter', 'deckvault', 'packpal', 'dropfarm', 'dropscout',
    'launchradar', 'memeradar', 'memestock', 'nftpulse', 'pointtrack',
    'rosterradar', 'skinsignal', 'socialindex', 'botindex', 'arbwatch'
  ];
  return validApps.includes(appId as AppId) ? (appId as AppId) : null;
}

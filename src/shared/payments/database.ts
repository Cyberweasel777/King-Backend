/**
 * Payment Module Database Operations
 * Supabase client for subscriptions and payment events
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  AppId,
  Subscription,
  SubscriptionTier,
  SubscriptionStatus,
  PaymentEvent,
} from './types';

// Initialize Supabase client from environment
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('Supabase credentials not configured. Payment module will not function.');
}

const supabase: SupabaseClient =
  supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey)
    : ({
        from() {
          throw new Error('Supabase is not configured (missing SUPABASE_URL/SUPABASE_SERVICE_KEY)');
        },
      } as unknown as SupabaseClient);

function isMissingSubscriptionsTableError(message?: string): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return m.includes("public.subscriptions") || m.includes("relation \"subscriptions\" does not exist");
}

function makeFallbackFreeSubscription(appId: AppId, externalUserId: string): Subscription {
  const now = new Date();
  return {
    id: `fallback:${appId}:${externalUserId}`,
    appId,
    externalUserId,
    tier: 'free',
    status: 'inactive',
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Get or create a subscription record
 */
export async function getOrCreateSubscription(
  appId: AppId,
  externalUserId: string
): Promise<Subscription> {
  try {
    // Try to get existing
    const { data: existing, error: readError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('app_id', appId)
      .eq('external_user_id', externalUserId)
      .single();

    if (readError && isMissingSubscriptionsTableError(readError.message)) {
      return makeFallbackFreeSubscription(appId, externalUserId);
    }

    if (existing) {
      return mapDbToSubscription(existing);
    }

    // Create new free subscription
    const { data: created, error } = await supabase
      .from('subscriptions')
      .insert({
        app_id: appId,
        external_user_id: externalUserId,
        tier: 'free',
        status: 'inactive',
      })
      .select()
      .single();

    if (error) {
      if (isMissingSubscriptionsTableError(error.message)) {
        return makeFallbackFreeSubscription(appId, externalUserId);
      }
      throw new Error(`Failed to create subscription: ${error.message}`);
    }

    return mapDbToSubscription(created);
  } catch (error: any) {
    if (isMissingSubscriptionsTableError(error?.message)) {
      return makeFallbackFreeSubscription(appId, externalUserId);
    }
    throw error;
  }
}

/**
 * Get subscription by app and external user ID
 */
export async function getSubscription(
  appId: AppId,
  externalUserId: string
): Promise<Subscription | null> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('app_id', appId)
    .eq('external_user_id', externalUserId)
    .single();

  if (error) {
    if (isMissingSubscriptionsTableError(error.message)) {
      return makeFallbackFreeSubscription(appId, externalUserId);
    }
    return null;
  }

  if (!data) return null;
  return mapDbToSubscription(data);
}

/**
 * Get subscription by Stripe customer ID
 */
export async function getSubscriptionByStripeCustomer(
  stripeCustomerId: string
): Promise<Subscription | null> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('stripe_customer_id', stripeCustomerId)
    .single();

  if (error || !data) return null;
  return mapDbToSubscription(data);
}

/**
 * Update subscription from Stripe webhook data
 */
export async function updateSubscriptionFromStripe(
  stripeCustomerId: string,
  updates: Partial<Subscription>
): Promise<Subscription> {
  const { data, error } = await supabase
    .from('subscriptions')
    .update({
      ...mapSubscriptionToDb(updates),
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_customer_id', stripeCustomerId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update subscription: ${error.message}`);
  }

  return mapDbToSubscription(data);
}

/**
 * Create or update subscription (upsert)
 */
export async function upsertSubscription(
  appId: AppId,
  externalUserId: string,
  updates: Partial<Subscription>
): Promise<Subscription> {
  const { data, error } = await supabase
    .from('subscriptions')
    .upsert(
      {
        app_id: appId,
        external_user_id: externalUserId,
        ...mapSubscriptionToDb(updates),
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'app_id,external_user_id',
      }
    )
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to upsert subscription: ${error.message}`);
  }

  return mapDbToSubscription(data);
}

/**
 * Record a payment event (idempotent)
 */
export async function recordPaymentEvent(
  event: Omit<PaymentEvent, 'id' | 'createdAt'>
): Promise<PaymentEvent | null> {
  // Check for duplicate
  const { data: existing } = await supabase
    .from('payment_events')
    .select('id')
    .eq('stripe_event_id', event.stripeEventId)
    .single();

  if (existing) {
    return null; // Already processed
  }

  const { data, error } = await supabase
    .from('payment_events')
    .insert({
      app_id: event.appId,
      event_type: event.eventType,
      stripe_event_id: event.stripeEventId,
      user_id: event.userId,
      external_user_id: event.externalUserId,
      amount: event.amount,
      currency: event.currency,
      tier: event.tier,
      metadata: event.metadata,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to record payment event: ${error.message}`);
  }

  return mapDbToPaymentEvent(data);
}

/**
 * Get payment stats for an app
 */
export async function getAppPaymentStats(
  appId: AppId,
  days: number = 30
): Promise<{
  totalUsers: number;
  activeSubscriptions: number;
  mrr: number;
  byTier: Record<SubscriptionTier, number>;
}> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  // Get all subscriptions for app
  const { data: subs, error: subsError } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('app_id', appId);

  if (subsError) {
    throw new Error(`Failed to get stats: ${subsError.message}`);
  }

  // Get revenue events
  const { data: events, error: eventsError } = await supabase
    .from('payment_events')
    .select('*')
    .eq('app_id', appId)
    .eq('event_type', 'invoice.payment_succeeded')
    .gte('created_at', since.toISOString());

  if (eventsError) {
    throw new Error(`Failed to get events: ${eventsError.message}`);
  }

  // Calculate MRR (simplified - actual MRR needs more logic)
  const mrr = events
    .filter((e: any) => e.amount)
    .reduce((sum: number, e: any) => sum + (e.amount || 0), 0);

  // Count by tier
  const byTier: Record<string, number> = {
    free: 0,
    basic: 0,
    pro: 0,
    enterprise: 0,
  };

  subs?.forEach((sub: any) => {
    byTier[sub.tier] = (byTier[sub.tier] || 0) + 1;
  });

  return {
    totalUsers: subs?.length || 0,
    activeSubscriptions: subs?.filter((s: any) => s.status === 'active').length || 0,
    mrr,
    byTier,
  };
}

/**
 * Get recent payment events for an app
 */
export async function getRecentPaymentEvents(
  appId: AppId,
  limit: number = 10
): Promise<PaymentEvent[]> {
  const { data, error } = await supabase
    .from('payment_events')
    .select('*')
    .eq('app_id', appId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to get events: ${error.message}`);
  }

  return (data || []).map(mapDbToPaymentEvent);
}

/**
 * Grant manual subscription (admin action)
 */
export async function grantSubscription(
  appId: AppId,
  externalUserId: string,
  tier: SubscriptionTier,
  durationDays: number = 30
): Promise<Subscription> {
  const periodEnd = new Date();
  periodEnd.setDate(periodEnd.getDate() + durationDays);

  return upsertSubscription(appId, externalUserId, {
    tier,
    status: 'active',
    currentPeriodEnd: periodEnd,
  });
}

/**
 * Revoke subscription (admin action)
 */
export async function revokeSubscription(
  appId: AppId,
  externalUserId: string
): Promise<Subscription> {
  return upsertSubscription(appId, externalUserId, {
    tier: 'free',
    status: 'inactive',
    stripeSubscriptionId: undefined,
    currentPeriodEnd: undefined,
  });
}

// Database mappers
function mapDbToSubscription(db: any): Subscription {
  return {
    id: db.id,
    userId: db.user_id,
    appId: db.app_id,
    externalUserId: db.external_user_id,
    stripeCustomerId: db.stripe_customer_id,
    stripeSubscriptionId: db.stripe_subscription_id,
    tier: db.tier,
    status: db.status,
    currentPeriodStart: db.current_period_start ? new Date(db.current_period_start) : undefined,
    currentPeriodEnd: db.current_period_end ? new Date(db.current_period_end) : undefined,
    createdAt: new Date(db.created_at),
    updatedAt: new Date(db.updated_at),
  };
}

function mapSubscriptionToDb(sub: Partial<Subscription>): any {
  return {
    ...(sub.userId && { user_id: sub.userId }),
    ...(sub.appId && { app_id: sub.appId }),
    ...(sub.externalUserId && { external_user_id: sub.externalUserId }),
    ...(sub.stripeCustomerId && { stripe_customer_id: sub.stripeCustomerId }),
    ...(sub.stripeSubscriptionId && { stripe_subscription_id: sub.stripeSubscriptionId }),
    ...(sub.tier && { tier: sub.tier }),
    ...(sub.status && { status: sub.status }),
    ...(sub.currentPeriodStart && { current_period_start: sub.currentPeriodStart.toISOString() }),
    ...(sub.currentPeriodEnd && { current_period_end: sub.currentPeriodEnd.toISOString() }),
  };
}

function mapDbToPaymentEvent(db: any): PaymentEvent {
  return {
    id: db.id,
    appId: db.app_id,
    eventType: db.event_type,
    stripeEventId: db.stripe_event_id,
    userId: db.user_id,
    externalUserId: db.external_user_id,
    amount: db.amount,
    currency: db.currency,
    tier: db.tier,
    metadata: db.metadata,
    createdAt: new Date(db.created_at),
  };
}

/**
 * Initialize database connection
 * Supabase client is initialized at import time;
 * this function serves as a startup check.
 */
export async function initDb(): Promise<void> {
  if (!supabaseUrl || !supabaseServiceKey) {
    console.warn('Supabase not configured — payment module disabled');
    return;
  }
  console.log('Payment database ready');
}

export { supabase };

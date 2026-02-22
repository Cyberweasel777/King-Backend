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
  ReferralCode,
  ReferralStats,
} from './types';
import {
  computeInitialGraceEnd,
  isLegacyArbwatchPaidTier,
} from './arbwatch-migration';

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

async function ensureArbwatchGrandfathering(subscription: Subscription): Promise<Subscription> {
  if (subscription.appId !== 'arbwatch') return subscription;
  if (subscription.grandfathered) return subscription;
  if (!isLegacyArbwatchPaidTier(subscription.tier)) return subscription;
  if (subscription.status !== 'active' && subscription.status !== 'trialing') return subscription;

  const graceEnd = computeInitialGraceEnd();

  const { data, error } = await supabase
    .from('subscriptions')
    .update({
      grandfathered: true,
      grandfathered_from_tier: subscription.tier,
      grandfathered_grace_end: graceEnd.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', subscription.id)
    .select()
    .single();

  if (error || !data) {
    return {
      ...subscription,
      grandfathered: true,
      grandfatheredFromTier: subscription.tier,
      grandfatheredGraceEnd: graceEnd,
    };
  }

  return mapDbToSubscription(data);
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
      return ensureArbwatchGrandfathering(mapDbToSubscription(existing));
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
  return ensureArbwatchGrandfathering(mapDbToSubscription(data));
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
  return ensureArbwatchGrandfathering(mapDbToSubscription(data));
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
    starter: 0,
    basic: 0,
    pro: 0,
    elite: 0,
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
    grandfathered: false,
    grandfatheredFromTier: undefined,
    grandfatheredGraceEnd: undefined,
  });
}

function makeReferralCode(appId: AppId, externalUserId: string): string {
  const appPrefix = appId.slice(0, 3).toUpperCase();
  const userSuffix = externalUserId.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase() || 'USER';
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${appPrefix}${userSuffix}${random}`;
}

export async function getOrCreateReferralCode(
  appId: AppId,
  externalUserId: string
): Promise<ReferralCode> {
  const { data: existing } = await supabase
    .from('referral_codes')
    .select('*')
    .eq('app_id', appId)
    .eq('external_user_id', externalUserId)
    .single();

  if (existing) return mapDbToReferralCode(existing);

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeReferralCode(appId, externalUserId);
    const { data, error } = await supabase
      .from('referral_codes')
      .insert({
        app_id: appId,
        external_user_id: externalUserId,
        code,
      })
      .select()
      .single();

    if (!error && data) return mapDbToReferralCode(data);
  }

  throw new Error('Failed to create referral code');
}

export async function resolveReferralCode(
  appId: AppId,
  code: string
): Promise<ReferralCode | null> {
  const normalized = code.trim().toUpperCase();
  const { data, error } = await supabase
    .from('referral_codes')
    .select('*')
    .eq('app_id', appId)
    .eq('code', normalized)
    .single();

  if (error || !data) return null;
  return mapDbToReferralCode(data);
}

export async function recordReferralConversion(args: {
  appId: AppId;
  referralCode: string;
  referredExternalUserId: string;
  checkoutSessionId?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  rewardMonths?: number;
  payoutCents?: number;
  metadata?: Record<string, any>;
}): Promise<void> {
  const referral = await resolveReferralCode(args.appId, args.referralCode);
  if (!referral) return;
  if (referral.externalUserId === args.referredExternalUserId) return;

  const rewardMonths = args.rewardMonths ?? 1;
  const payoutCents = args.payoutCents ?? 0;

  await supabase
    .from('referral_conversions')
    .upsert(
      {
        app_id: args.appId,
        referrer_external_user_id: referral.externalUserId,
        referred_external_user_id: args.referredExternalUserId,
        checkout_session_id: args.checkoutSessionId,
        stripe_customer_id: args.stripeCustomerId,
        stripe_subscription_id: args.stripeSubscriptionId,
        status: 'converted',
        reward_months: rewardMonths,
        payout_cents: payoutCents,
        converted_at: new Date().toISOString(),
        metadata: {
          referral_code: args.referralCode,
          ...(args.metadata || {}),
        },
      },
      { onConflict: 'app_id,referred_external_user_id' }
    );
}

export async function getReferralStats(
  appId: AppId,
  externalUserId: string
): Promise<ReferralStats> {
  const referralCode = await getOrCreateReferralCode(appId, externalUserId);

  const { data: rows, error } = await supabase
    .from('referral_conversions')
    .select('*')
    .eq('app_id', appId)
    .eq('referrer_external_user_id', externalUserId);

  if (error) {
    throw new Error(`Failed to load referral stats: ${error.message}`);
  }

  const entries = rows || [];
  const converted = entries.filter((r: any) => r.status === 'converted');
  const pending = entries.filter((r: any) => r.status === 'pending');

  return {
    appId,
    externalUserId,
    code: referralCode.code,
    totalReferrals: entries.length,
    convertedReferrals: converted.length,
    pendingReferrals: pending.length,
    totalPayoutCents: converted.reduce((sum: number, r: any) => sum + (r.payout_cents || 0), 0),
    totalRewardMonths: converted.reduce((sum: number, r: any) => sum + (r.reward_months || 0), 0),
  };
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
    grandfathered: Boolean(db.grandfathered),
    grandfatheredFromTier: db.grandfathered_from_tier,
    grandfatheredGraceEnd: db.grandfathered_grace_end ? new Date(db.grandfathered_grace_end) : undefined,
    createdAt: new Date(db.created_at),
    updatedAt: new Date(db.updated_at),
  };
}

function mapSubscriptionToDb(sub: Partial<Subscription>): any {
  return {
    ...(sub.userId !== undefined && { user_id: sub.userId }),
    ...(sub.appId !== undefined && { app_id: sub.appId }),
    ...(sub.externalUserId !== undefined && { external_user_id: sub.externalUserId }),
    ...(sub.stripeCustomerId !== undefined && { stripe_customer_id: sub.stripeCustomerId }),
    ...(sub.stripeSubscriptionId !== undefined && { stripe_subscription_id: sub.stripeSubscriptionId }),
    ...(sub.tier !== undefined && { tier: sub.tier }),
    ...(sub.status !== undefined && { status: sub.status }),
    ...(sub.currentPeriodStart !== undefined && { current_period_start: sub.currentPeriodStart?.toISOString() }),
    ...(sub.currentPeriodEnd !== undefined && { current_period_end: sub.currentPeriodEnd?.toISOString() }),
    ...(sub.grandfathered !== undefined && { grandfathered: sub.grandfathered }),
    ...(sub.grandfatheredFromTier !== undefined && { grandfathered_from_tier: sub.grandfatheredFromTier }),
    ...(sub.grandfatheredGraceEnd !== undefined && { grandfathered_grace_end: sub.grandfatheredGraceEnd?.toISOString() }),
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

function mapDbToReferralCode(db: any): ReferralCode {
  return {
    id: db.id,
    appId: db.app_id,
    externalUserId: db.external_user_id,
    code: db.code,
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

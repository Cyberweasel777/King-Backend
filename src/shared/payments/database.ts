/**
 * Payment Module Database Operations
 * Convex client for subscriptions and payment events
 */

import {
  AppId,
  PaymentEvent,
  ReferralCode,
  ReferralStats,
  Subscription,
  SubscriptionTier,
} from './types';
import { computeInitialGraceEnd, isLegacyArbwatchPaidTier } from './arbwatch-migration';
import { getConvexPaymentStore } from './convex-client';
import { logger } from '../../utils/logger';

let cachedStore: ReturnType<typeof getConvexPaymentStore> | null = null;

function store() {
  if (!cachedStore) {
    cachedStore = getConvexPaymentStore();
  }
  return cachedStore;
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

  try {
    return await store().upsertSubscription(subscription.appId, subscription.externalUserId, {
      grandfathered: true,
      grandfatheredFromTier: subscription.tier,
      grandfatheredGraceEnd: graceEnd,
    });
  } catch {
    return {
      ...subscription,
      grandfathered: true,
      grandfatheredFromTier: subscription.tier,
      grandfatheredGraceEnd: graceEnd,
    };
  }
}

export async function getOrCreateSubscription(appId: AppId, externalUserId: string): Promise<Subscription> {
  const existing = await store().getSubscription(appId, externalUserId);
  if (existing) return ensureArbwatchGrandfathering(existing);

  const created = await store().upsertSubscription(appId, externalUserId, {
    tier: 'free',
    status: 'inactive',
  });

  return ensureArbwatchGrandfathering(created);
}

export async function getSubscription(appId: AppId, externalUserId: string): Promise<Subscription | null> {
  const subscription = await store().getSubscription(appId, externalUserId);
  if (!subscription) return makeFallbackFreeSubscription(appId, externalUserId);
  return ensureArbwatchGrandfathering(subscription);
}

export async function getSubscriptionByStripeCustomer(stripeCustomerId: string): Promise<Subscription | null> {
  const subscription = await store().getSubscriptionByStripeCustomer(stripeCustomerId);
  if (!subscription) return null;
  return ensureArbwatchGrandfathering(subscription);
}

export async function updateSubscriptionFromStripe(
  stripeCustomerId: string,
  updates: Partial<Subscription>
): Promise<Subscription> {
  const existing = await store().getSubscriptionByStripeCustomer(stripeCustomerId);
  if (!existing) {
    throw new Error(`Failed to update subscription: stripe customer ${stripeCustomerId} not found`);
  }

  return store().upsertSubscription(existing.appId, existing.externalUserId, updates);
}

export async function upsertSubscription(
  appId: AppId,
  externalUserId: string,
  updates: Partial<Subscription>
): Promise<Subscription> {
  return store().upsertSubscription(appId, externalUserId, updates);
}

export async function recordPaymentEvent(
  event: Omit<PaymentEvent, 'id' | 'createdAt'>
): Promise<PaymentEvent | null> {
  return store().recordPaymentEvent(event);
}

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

  const [subs, events] = await Promise.all([
    store().listSubscriptionsByApp(appId),
    store().listPaymentEvents({
      appId,
      eventType: 'invoice.payment_succeeded',
      sinceIso: since.toISOString(),
      limit: 5000,
    }),
  ]);

  const mrr = events.filter((e) => e.amount).reduce((sum, e) => sum + (e.amount || 0), 0);

  const byTier: Record<SubscriptionTier, number> = {
    free: 0,
    starter: 0,
    basic: 0,
    pro: 0,
    elite: 0,
    enterprise: 0,
  };

  subs.forEach((sub) => {
    byTier[sub.tier] = (byTier[sub.tier] || 0) + 1;
  });

  return {
    totalUsers: subs.length,
    activeSubscriptions: subs.filter((s) => s.status === 'active').length,
    mrr,
    byTier,
  };
}

export async function getRecentPaymentEvents(appId: AppId, limit: number = 10): Promise<PaymentEvent[]> {
  return store().listPaymentEvents({ appId, limit });
}

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

export async function revokeSubscription(appId: AppId, externalUserId: string): Promise<Subscription> {
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

export async function getOrCreateReferralCode(appId: AppId, externalUserId: string): Promise<ReferralCode> {
  const existing = await store().getReferralCodeByOwner(appId, externalUserId);
  if (existing) return existing;
  return store().getOrCreateReferralCode(appId, externalUserId);
}

export async function resolveReferralCode(appId: AppId, code: string): Promise<ReferralCode | null> {
  const normalized = code.trim().toUpperCase();
  return store().resolveReferralCode(appId, normalized);
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

  await store().upsertReferralConversion({
    appId: args.appId,
    referrerExternalUserId: referral.externalUserId,
    referredExternalUserId: args.referredExternalUserId,
    checkoutSessionId: args.checkoutSessionId,
    stripeCustomerId: args.stripeCustomerId,
    stripeSubscriptionId: args.stripeSubscriptionId,
    status: 'converted',
    rewardMonths: args.rewardMonths ?? 1,
    payoutCents: args.payoutCents ?? 0,
    convertedAt: new Date().toISOString(),
    metadata: {
      referral_code: args.referralCode,
      ...(args.metadata || {}),
    },
  });
}

export async function getReferralStats(appId: AppId, externalUserId: string): Promise<ReferralStats> {
  const referralCode = await getOrCreateReferralCode(appId, externalUserId);
  const entries = await store().listReferralConversions(appId, externalUserId);

  const converted = entries.filter((r: any) => r.status === 'converted');
  const pending = entries.filter((r: any) => r.status === 'pending');

  return {
    appId,
    externalUserId,
    code: referralCode.code,
    totalReferrals: entries.length,
    convertedReferrals: converted.length,
    pendingReferrals: pending.length,
    totalPayoutCents: converted.reduce((sum: number, r: any) => sum + (r.payoutCents || 0), 0),
    totalRewardMonths: converted.reduce((sum: number, r: any) => sum + (r.rewardMonths || 0), 0),
  };
}

export async function initDb(): Promise<void> {
  logger.info('Payment database ready (Convex)');
}

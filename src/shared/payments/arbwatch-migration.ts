import type { Subscription, SubscriptionTier } from './types';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function isLegacyArbwatchPaidTier(tier: SubscriptionTier): boolean {
  return tier === 'basic' || tier === 'pro';
}

export function mapLegacyTierToV2Tier(legacyTier: SubscriptionTier): SubscriptionTier {
  if (legacyTier === 'basic') return 'starter';
  if (legacyTier === 'pro') return 'pro';
  return legacyTier;
}

export function computeInitialGraceEnd(now: Date = new Date()): Date {
  return new Date(now.getTime() + THIRTY_DAYS_MS);
}

export function getEffectiveSubscription(subscription: Subscription, now: Date = new Date()): {
  effectiveTier: SubscriptionTier;
  inGrandfatherGrace: boolean;
  shouldAutoMigrate: boolean;
  mappedTier: SubscriptionTier;
} {
  const mappedTier = mapLegacyTierToV2Tier(subscription.grandfatheredFromTier || subscription.tier);

  if (!subscription.grandfathered || !subscription.grandfatheredGraceEnd) {
    return {
      effectiveTier: mappedTier,
      inGrandfatherGrace: false,
      shouldAutoMigrate: false,
      mappedTier,
    };
  }

  if (subscription.grandfatheredGraceEnd.getTime() > now.getTime()) {
    return {
      effectiveTier: 'pro',
      inGrandfatherGrace: true,
      shouldAutoMigrate: false,
      mappedTier,
    };
  }

  return {
    effectiveTier: mappedTier,
    inGrandfatherGrace: false,
    shouldAutoMigrate: subscription.tier !== mappedTier,
    mappedTier,
  };
}

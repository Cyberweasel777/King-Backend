import type { Subscription, SubscriptionTier } from './types';
export declare function isLegacyArbwatchPaidTier(tier: SubscriptionTier): boolean;
export declare function mapLegacyTierToV2Tier(legacyTier: SubscriptionTier): SubscriptionTier;
export declare function computeInitialGraceEnd(now?: Date): Date;
export declare function getEffectiveSubscription(subscription: Subscription, now?: Date): {
    effectiveTier: SubscriptionTier;
    inGrandfatherGrace: boolean;
    shouldAutoMigrate: boolean;
    mappedTier: SubscriptionTier;
};
//# sourceMappingURL=arbwatch-migration.d.ts.map
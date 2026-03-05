"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isLegacyArbwatchPaidTier = isLegacyArbwatchPaidTier;
exports.mapLegacyTierToV2Tier = mapLegacyTierToV2Tier;
exports.computeInitialGraceEnd = computeInitialGraceEnd;
exports.getEffectiveSubscription = getEffectiveSubscription;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
function isLegacyArbwatchPaidTier(tier) {
    return tier === 'basic' || tier === 'pro';
}
function mapLegacyTierToV2Tier(legacyTier) {
    if (legacyTier === 'basic')
        return 'starter';
    if (legacyTier === 'pro')
        return 'pro';
    return legacyTier;
}
function computeInitialGraceEnd(now = new Date()) {
    return new Date(now.getTime() + THIRTY_DAYS_MS);
}
function getEffectiveSubscription(subscription, now = new Date()) {
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
//# sourceMappingURL=arbwatch-migration.js.map
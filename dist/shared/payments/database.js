"use strict";
/**
 * Payment Module Database Operations
 * Convex client for subscriptions and payment events
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrCreateSubscription = getOrCreateSubscription;
exports.getSubscription = getSubscription;
exports.getSubscriptionByStripeCustomer = getSubscriptionByStripeCustomer;
exports.updateSubscriptionFromStripe = updateSubscriptionFromStripe;
exports.upsertSubscription = upsertSubscription;
exports.recordPaymentEvent = recordPaymentEvent;
exports.getAppPaymentStats = getAppPaymentStats;
exports.getRecentPaymentEvents = getRecentPaymentEvents;
exports.grantSubscription = grantSubscription;
exports.revokeSubscription = revokeSubscription;
exports.getOrCreateReferralCode = getOrCreateReferralCode;
exports.resolveReferralCode = resolveReferralCode;
exports.recordReferralConversion = recordReferralConversion;
exports.getReferralStats = getReferralStats;
exports.initDb = initDb;
const arbwatch_migration_1 = require("./arbwatch-migration");
const convex_client_1 = require("./convex-client");
let cachedStore = null;
function store() {
    if (!cachedStore) {
        cachedStore = (0, convex_client_1.getConvexPaymentStore)();
    }
    return cachedStore;
}
function makeFallbackFreeSubscription(appId, externalUserId) {
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
async function ensureArbwatchGrandfathering(subscription) {
    if (subscription.appId !== 'arbwatch')
        return subscription;
    if (subscription.grandfathered)
        return subscription;
    if (!(0, arbwatch_migration_1.isLegacyArbwatchPaidTier)(subscription.tier))
        return subscription;
    if (subscription.status !== 'active' && subscription.status !== 'trialing')
        return subscription;
    const graceEnd = (0, arbwatch_migration_1.computeInitialGraceEnd)();
    try {
        return await store().upsertSubscription(subscription.appId, subscription.externalUserId, {
            grandfathered: true,
            grandfatheredFromTier: subscription.tier,
            grandfatheredGraceEnd: graceEnd,
        });
    }
    catch {
        return {
            ...subscription,
            grandfathered: true,
            grandfatheredFromTier: subscription.tier,
            grandfatheredGraceEnd: graceEnd,
        };
    }
}
async function getOrCreateSubscription(appId, externalUserId) {
    const existing = await store().getSubscription(appId, externalUserId);
    if (existing)
        return ensureArbwatchGrandfathering(existing);
    const created = await store().upsertSubscription(appId, externalUserId, {
        tier: 'free',
        status: 'inactive',
    });
    return ensureArbwatchGrandfathering(created);
}
async function getSubscription(appId, externalUserId) {
    const subscription = await store().getSubscription(appId, externalUserId);
    if (!subscription)
        return makeFallbackFreeSubscription(appId, externalUserId);
    return ensureArbwatchGrandfathering(subscription);
}
async function getSubscriptionByStripeCustomer(stripeCustomerId) {
    const subscription = await store().getSubscriptionByStripeCustomer(stripeCustomerId);
    if (!subscription)
        return null;
    return ensureArbwatchGrandfathering(subscription);
}
async function updateSubscriptionFromStripe(stripeCustomerId, updates) {
    const existing = await store().getSubscriptionByStripeCustomer(stripeCustomerId);
    if (!existing) {
        throw new Error(`Failed to update subscription: stripe customer ${stripeCustomerId} not found`);
    }
    return store().upsertSubscription(existing.appId, existing.externalUserId, updates);
}
async function upsertSubscription(appId, externalUserId, updates) {
    return store().upsertSubscription(appId, externalUserId, updates);
}
async function recordPaymentEvent(event) {
    return store().recordPaymentEvent(event);
}
async function getAppPaymentStats(appId, days = 30) {
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
    const byTier = {
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
async function getRecentPaymentEvents(appId, limit = 10) {
    return store().listPaymentEvents({ appId, limit });
}
async function grantSubscription(appId, externalUserId, tier, durationDays = 30) {
    const periodEnd = new Date();
    periodEnd.setDate(periodEnd.getDate() + durationDays);
    return upsertSubscription(appId, externalUserId, {
        tier,
        status: 'active',
        currentPeriodEnd: periodEnd,
    });
}
async function revokeSubscription(appId, externalUserId) {
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
async function getOrCreateReferralCode(appId, externalUserId) {
    const existing = await store().getReferralCodeByOwner(appId, externalUserId);
    if (existing)
        return existing;
    return store().getOrCreateReferralCode(appId, externalUserId);
}
async function resolveReferralCode(appId, code) {
    const normalized = code.trim().toUpperCase();
    return store().resolveReferralCode(appId, normalized);
}
async function recordReferralConversion(args) {
    const referral = await resolveReferralCode(args.appId, args.referralCode);
    if (!referral)
        return;
    if (referral.externalUserId === args.referredExternalUserId)
        return;
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
async function getReferralStats(appId, externalUserId) {
    const referralCode = await getOrCreateReferralCode(appId, externalUserId);
    const entries = await store().listReferralConversions(appId, externalUserId);
    const converted = entries.filter((r) => r.status === 'converted');
    const pending = entries.filter((r) => r.status === 'pending');
    return {
        appId,
        externalUserId,
        code: referralCode.code,
        totalReferrals: entries.length,
        convertedReferrals: converted.length,
        pendingReferrals: pending.length,
        totalPayoutCents: converted.reduce((sum, r) => sum + (r.payoutCents || 0), 0),
        totalRewardMonths: converted.reduce((sum, r) => sum + (r.rewardMonths || 0), 0),
    };
}
async function initDb() {
    console.log('Payment database ready (Convex)');
}
//# sourceMappingURL=database.js.map
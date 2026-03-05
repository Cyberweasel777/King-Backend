/**
 * Payment Module Database Operations
 * Convex client for subscriptions and payment events
 */
import { AppId, PaymentEvent, ReferralCode, ReferralStats, Subscription, SubscriptionTier } from './types';
export declare function getOrCreateSubscription(appId: AppId, externalUserId: string): Promise<Subscription>;
export declare function getSubscription(appId: AppId, externalUserId: string): Promise<Subscription | null>;
export declare function getSubscriptionByStripeCustomer(stripeCustomerId: string): Promise<Subscription | null>;
export declare function updateSubscriptionFromStripe(stripeCustomerId: string, updates: Partial<Subscription>): Promise<Subscription>;
export declare function upsertSubscription(appId: AppId, externalUserId: string, updates: Partial<Subscription>): Promise<Subscription>;
export declare function recordPaymentEvent(event: Omit<PaymentEvent, 'id' | 'createdAt'>): Promise<PaymentEvent | null>;
export declare function getAppPaymentStats(appId: AppId, days?: number): Promise<{
    totalUsers: number;
    activeSubscriptions: number;
    mrr: number;
    byTier: Record<SubscriptionTier, number>;
}>;
export declare function getRecentPaymentEvents(appId: AppId, limit?: number): Promise<PaymentEvent[]>;
export declare function grantSubscription(appId: AppId, externalUserId: string, tier: SubscriptionTier, durationDays?: number): Promise<Subscription>;
export declare function revokeSubscription(appId: AppId, externalUserId: string): Promise<Subscription>;
export declare function getOrCreateReferralCode(appId: AppId, externalUserId: string): Promise<ReferralCode>;
export declare function resolveReferralCode(appId: AppId, code: string): Promise<ReferralCode | null>;
export declare function recordReferralConversion(args: {
    appId: AppId;
    referralCode: string;
    referredExternalUserId: string;
    checkoutSessionId?: string;
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    rewardMonths?: number;
    payoutCents?: number;
    metadata?: Record<string, any>;
}): Promise<void>;
export declare function getReferralStats(appId: AppId, externalUserId: string): Promise<ReferralStats>;
export declare function initDb(): Promise<void>;
//# sourceMappingURL=database.d.ts.map
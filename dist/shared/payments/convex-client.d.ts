import { AppId, PaymentEvent, ReferralCode, Subscription } from './types';
export interface ConvexPaymentStore {
    getSubscription(appId: AppId, externalUserId: string): Promise<Subscription | null>;
    getSubscriptionByStripeCustomer(stripeCustomerId: string): Promise<Subscription | null>;
    upsertSubscription(appId: AppId, externalUserId: string, updates: Partial<Subscription>): Promise<Subscription>;
    listSubscriptionsByApp(appId: AppId): Promise<Subscription[]>;
    recordPaymentEvent(event: Omit<PaymentEvent, 'id' | 'createdAt'>): Promise<PaymentEvent | null>;
    listPaymentEvents(args: {
        appId: AppId;
        limit?: number;
        eventType?: string;
        sinceIso?: string;
    }): Promise<PaymentEvent[]>;
    getOrCreateReferralCode(appId: AppId, externalUserId: string): Promise<ReferralCode>;
    getReferralCodeByOwner(appId: AppId, externalUserId: string): Promise<ReferralCode | null>;
    resolveReferralCode(appId: AppId, code: string): Promise<ReferralCode | null>;
    upsertReferralConversion(args: {
        appId: AppId;
        referrerExternalUserId: string;
        referredExternalUserId: string;
        checkoutSessionId?: string;
        stripeCustomerId?: string;
        stripeSubscriptionId?: string;
        status: 'pending' | 'converted' | 'rejected';
        rewardMonths: number;
        payoutCents: number;
        convertedAt?: string;
        metadata?: Record<string, any>;
    }): Promise<void>;
    listReferralConversions(appId: AppId, referrerExternalUserId: string): Promise<any[]>;
}
export declare function getConvexPaymentStore(): ConvexPaymentStore;
//# sourceMappingURL=convex-client.d.ts.map
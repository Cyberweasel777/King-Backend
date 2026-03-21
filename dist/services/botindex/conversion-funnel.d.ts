export type FunnelEventType = 'register_page_hit' | 'sentinel_interstitial_shown' | 'checkout_session_created' | 'checkout_completed' | 'api_key_issued';
export declare function trackFunnelEvent(type: FunnelEventType, plan?: 'free' | 'basic' | 'pro' | 'starter' | 'sentinel' | 'enterprise', source?: string, referer?: string): void;
export declare function getFunnelStats(): {
    since: string | null;
    eventsTracked: number;
    registerHits: number;
    checkoutCreated: number;
    checkoutCompleted: number;
    apiKeysIssued: number;
    conversion: {
        registerToCheckoutPct: number;
        checkoutToCompletePct: number;
        completeToKeyPct: number;
        registerToKeyPct: number;
    };
    lastEventAt: string | null;
};
//# sourceMappingURL=conversion-funnel.d.ts.map
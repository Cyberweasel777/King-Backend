type Plan = 'free' | 'basic' | 'pro' | 'starter' | 'sentinel' | 'enterprise';
type SendApiKeyEmailParams = {
    to: string;
    apiKey: string;
    plan: Plan;
};
export declare function sendApiKeyEmail(params: SendApiKeyEmailParams): Promise<void>;
export {};
//# sourceMappingURL=key-delivery-email.d.ts.map
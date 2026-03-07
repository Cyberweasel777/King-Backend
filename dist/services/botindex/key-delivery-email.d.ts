type Plan = 'free' | 'basic' | 'pro';
type SendApiKeyEmailParams = {
    to: string;
    apiKey: string;
    plan: Plan;
};
export declare function sendApiKeyEmail(params: SendApiKeyEmailParams): Promise<void>;
export {};
//# sourceMappingURL=key-delivery-email.d.ts.map
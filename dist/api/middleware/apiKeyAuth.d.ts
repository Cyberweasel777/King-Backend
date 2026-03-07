import type { RequestHandler } from 'express';
export type BotIndexApiPlan = 'free' | 'basic' | 'pro';
export interface ApiKeyLedgerEntry {
    email: string;
    stripeCustomerId?: string;
    plan: BotIndexApiPlan;
    createdAt: string;
    lastUsed: string;
    requestCount: number;
    status: 'active';
}
declare global {
    namespace Express {
        interface Request {
            apiKeyAuth?: {
                email: string;
                plan: BotIndexApiPlan;
                apiKey: string;
            };
        }
    }
}
export declare function generateApiKey(): string;
export declare function createApiKeyEntry(params: {
    apiKey: string;
    email: string;
    stripeCustomerId?: string;
    plan: BotIndexApiPlan;
}): ApiKeyLedgerEntry;
export declare function getApiKeyEntry(apiKey: string): ApiKeyLedgerEntry | null;
export declare const requireApiKey: RequestHandler;
export declare const optionalApiKey: RequestHandler;
export declare function getAllApiKeys(): {
    key: string;
    entry: ApiKeyLedgerEntry;
}[];
//# sourceMappingURL=apiKeyAuth.d.ts.map
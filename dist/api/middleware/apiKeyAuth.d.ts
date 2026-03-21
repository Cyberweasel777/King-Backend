import type { Request, RequestHandler } from 'express';
export type BotIndexApiPlan = 'free' | 'basic' | 'pro' | 'starter' | 'sentinel' | 'enterprise';
export interface ApiKeyLedgerEntry {
    email: string;
    stripeCustomerId?: string;
    walletAddress?: string;
    plan: BotIndexApiPlan;
    createdAt: string;
    lastUsed: string;
    requestCount: number;
    dailyLimit?: number;
    dailyCount?: number;
    dailyCountDate?: string;
    status: 'active';
    last_active_date?: string;
    days_active?: number;
    second_call_hours?: number;
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
export declare function extractApiKey(req: Request): string | null;
export declare function generateApiKey(): string;
export declare function updateApiKeyWallet(apiKey: string, walletAddress: string): boolean;
export declare function createApiKeyEntry(params: {
    apiKey: string;
    email: string;
    stripeCustomerId?: string;
    walletAddress?: string;
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
import type { RequestHandler } from 'express';
export interface FreeTrialOptions {
    /** Override default limit per wallet (default: FREE_TRIAL_LIMIT env or 50) */
    limit?: number;
}
/**
 * Free trial middleware. Place BEFORE x402Gate in the middleware chain.
 * If wallet has remaining free requests, bypasses x402 and serves data.
 * If no wallet provided or trial exhausted, calls next() to hit x402Gate.
 */
export declare function freeTrialGate(options?: FreeTrialOptions): RequestHandler;
/**
 * Conditional x402 gate that skips if free trial already authenticated.
 * Wrap your existing x402Gate with this.
 */
export declare function skipIfFreeTrial(x402Handler: RequestHandler): RequestHandler;
/** Get trial stats for admin/monitoring */
export declare function getTrialStats(): {
    freeTrialLimit: number;
    totalWallets: number;
    totalRequests: number;
    exhaustedWallets: number;
    activeWallets: number;
    wallets: {
        hash: string;
        count: number;
        remaining: number;
        firstSeen: string;
        lastSeen: string;
    }[];
};
//# sourceMappingURL=freeTrial.d.ts.map
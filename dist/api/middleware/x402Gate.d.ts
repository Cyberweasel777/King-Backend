import type { RequestHandler } from 'express';
import { z } from 'zod';
declare const NETWORK_SCHEMA: z.ZodEnum<["base-sepolia", "base", "eip155:84532", "eip155:8453"]>;
type SupportedNetwork = z.infer<typeof NETWORK_SCHEMA>;
export type X402GateOptions = {
    price?: string;
    description?: string;
    network?: SupportedNetwork;
};
export type X402RuntimeConfig = {
    enabled: boolean;
    network: SupportedNetwork;
};
export declare function isX402Enabled(): boolean;
/**
 * Build a machine-readable x402 payment-required payload for embedding in
 * 429/401 responses. Allows agents with x402 clients to detect the upgrade
 * path and auto-pay instead of hitting a dead end at the rate limit wall.
 *
 * Returns null if x402 is not enabled or wallet is not configured.
 */
export declare function buildX402UpgradePayload(requestUrl: string, price?: string): {
    header: string;
    body: Record<string, unknown>;
} | null;
export declare function getX402RuntimeConfig(): X402RuntimeConfig;
export declare function createX402Gate(options?: X402GateOptions): RequestHandler;
export {};
//# sourceMappingURL=x402Gate.d.ts.map
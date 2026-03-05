/**
 * Anonymous (unauthenticated) rate limiter for BotIndex endpoints.
 *
 * Limits unauthenticated requests by IP to push visitors toward
 * API key registration. Authenticated requests (API key or x402) bypass.
 *
 * Default: 3 requests per hour per IP on gated endpoints.
 */
import type { RequestHandler } from 'express';
/**
 * Rate limit anonymous requests. Place AFTER optionalApiKey middleware.
 * If req.apiKeyAuth is set, or __freeTrialAuthenticated is true, skip.
 */
export declare function anonRateLimit(paths: string[]): RequestHandler;
/** Get rate limit stats for admin/monitoring */
export declare function getAnonRateLimitStats(): {
    anonHourlyLimit: number;
    activeIps: number;
    limitedIps: number;
};
//# sourceMappingURL=anonRateLimit.d.ts.map
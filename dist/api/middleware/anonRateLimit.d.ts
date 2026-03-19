/**
 * Anonymous (unauthenticated) rate limiter for BotIndex endpoints.
 *
 * Limits unauthenticated requests by IP to push visitors toward
 * API key registration. Authenticated requests (API key or x402) bypass.
 *
 * Default: 3 requests per DAY per IP on gated endpoints.
 * Free API key: 3 req/day — raw data only. Intelligence requires Pro+.
 */
import type { RequestHandler } from 'express';
/**
 * Rate limit anonymous requests. Place AFTER optionalApiKey middleware.
 * If req.apiKeyAuth is set, or __freeTrialAuthenticated is true, skip.
 *
 * On pass-through, sets __freeTrialAuthenticated = true so downstream
 * x402 gates don't block the request.
 *
 * @param paths - Paths to rate limit
 * @param exclude - Specific sub-paths to exclude (for x402-paid endpoints)
 */
export declare function anonRateLimit(paths: string[], exclude?: string[]): RequestHandler;
/** Get rate limit stats for admin/monitoring */
export declare function getAnonRateLimitStats(): {
    anonDailyLimit: number;
    activeIps: number;
    limitedIps: number;
};
//# sourceMappingURL=anonRateLimit.d.ts.map
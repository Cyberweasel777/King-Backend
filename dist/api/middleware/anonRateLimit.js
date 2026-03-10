"use strict";
/**
 * Anonymous (unauthenticated) rate limiter for BotIndex endpoints.
 *
 * Limits unauthenticated requests by IP to push visitors toward
 * API key registration. Authenticated requests (API key or x402) bypass.
 *
 * Default: 3 requests per DAY per IP on gated endpoints.
 * Free API key: 100 req/day (handled in botindex routes).
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.anonRateLimit = anonRateLimit;
exports.getAnonRateLimitStats = getAnonRateLimitStats;
const logger_1 = __importDefault(require("../../config/logger"));
const ANON_DAILY_LIMIT = parseInt(process.env.ANON_RATE_LIMIT || '3', 10);
const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const ipWindows = new Map();
// Cleanup stale entries every 30 minutes
setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of ipWindows.entries()) {
        if (now - entry.windowStartMs >= WINDOW_MS * 2) {
            ipWindows.delete(ip);
        }
    }
}, 30 * 60 * 1000);
function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
        return forwarded.split(',')[0]?.trim() || 'unknown';
    }
    return req.ip || req.socket.remoteAddress || 'unknown';
}
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
function anonRateLimit(paths, exclude = []) {
    const pathSet = new Set(paths);
    const excludeSet = new Set(exclude);
    return (req, res, next) => {
        // Skip if authenticated via API key
        if (req.apiKeyAuth) {
            next();
            return;
        }
        // Skip if free trial authenticated (wallet-based)
        if (req.__freeTrialAuthenticated) {
            next();
            return;
        }
        // Skip excluded paths (x402-paid endpoints handle their own access control)
        if (excludeSet.has(req.path) || Array.from(excludeSet).some(p => req.path.startsWith(p))) {
            next();
            return;
        }
        // Only apply to specified paths
        const matchesPath = pathSet.has(req.path) ||
            Array.from(pathSet).some(p => req.path.startsWith(p));
        if (!matchesPath) {
            next();
            return;
        }
        const ip = getClientIp(req);
        logger_1.default.info({ ip, path: req.path, isAnon: true }, 'Anonymous request blocked — API key required');
        res.status(401).json({
            error: 'api_key_required',
            message: 'An API key is required to access BotIndex endpoints. Get one free in 10 seconds — no credit card needed.',
            get_key: {
                url: 'https://api.botindex.dev/api/botindex/keys/register?plan=free',
                method: 'GET',
                description: 'Free API key — 100 req/day, instant activation. Copy a curl command from the response and you are live.',
            },
            upgrade: {
                pro: {
                    url: 'https://api.botindex.dev/api/botindex/keys/register?plan=pro',
                    description: 'Pro plan — unlimited requests, $29/mo via Stripe',
                },
                x402: {
                    url: 'https://api.botindex.dev/api/botindex/keys/connect',
                    description: 'Pay per call with crypto — no subscription, no key needed',
                },
            },
            header: 'X-API-Key: <your-key>',
        });
    };
}
/** Get rate limit stats for admin/monitoring */
function getAnonRateLimitStats() {
    const now = Date.now();
    let activeIps = 0;
    let limitedIps = 0;
    for (const [, entry] of ipWindows.entries()) {
        if (now - entry.windowStartMs < WINDOW_MS) {
            activeIps++;
            if (entry.count > ANON_DAILY_LIMIT)
                limitedIps++;
        }
    }
    return { anonDailyLimit: ANON_DAILY_LIMIT, activeIps, limitedIps };
}
//# sourceMappingURL=anonRateLimit.js.map
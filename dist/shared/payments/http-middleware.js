"use strict";
/**
 * HTTP (Express) subscription middleware
 *
 * We don't have Supabase auth wired yet, so this middleware uses an external user id
 * (e.g., Telegram user id) passed via header or querystring:
 *   - header: x-external-user-id
 *   - query:  ?user=8063432083
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.withSubscriptionHttp = withSubscriptionHttp;
exports.withFreeLimit = withFreeLimit;
exports.getFreeLimitKey = getFreeLimitKey;
const access_control_1 = require("./access-control");
const funnel_tracker_1 = require("../../services/botindex/funnel-tracker");
const DAILY_COUNTER = new Map();
function utcDay() {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
function getExternalUserId(req) {
    const h = req.header('x-external-user-id');
    const q = typeof req.query.user === 'string' ? req.query.user : null;
    return h || q || null;
}
function withSubscriptionHttp(appId, minimumTier = 'basic') {
    return async (req, res, next) => {
        const externalUserId = getExternalUserId(req);
        if (!externalUserId) {
            res.status(401).json({
                error: 'missing_user',
                message: 'Provide x-external-user-id header (e.g. Telegram user id) or ?user=... to access paid features.'
            });
            return;
        }
        const ok = await (0, access_control_1.isSubscribed)(appId, externalUserId, minimumTier);
        if (!ok) {
            const checkoutPath = `/api/payments/checkout?app=${encodeURIComponent(appId)}&tier=${encodeURIComponent(minimumTier)}&user=${encodeURIComponent(externalUserId)}`;
            const proto = (req.header('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
            const host = (req.header('x-forwarded-host') || req.header('host') || '').split(',')[0].trim();
            const checkoutUrl = host ? `${proto}://${host}${checkoutPath}` : checkoutPath;
            res.status(402).json({
                error: 'subscription_required',
                appId,
                requiredTier: minimumTier,
                checkoutUrl,
                message: 'Upgrade required for this endpoint.'
            });
            return;
        }
        next();
    };
}
function withFreeLimit(options) {
    return (req, res, next) => {
        const day = utcDay();
        const k = options.key(req);
        const key = `${day}:${k}`;
        const cur = DAILY_COUNTER.get(key);
        if (!cur) {
            DAILY_COUNTER.set(key, { day, count: 1 });
            next();
            return;
        }
        if (cur.day !== day) {
            DAILY_COUNTER.set(key, { day, count: 1 });
            next();
            return;
        }
        if (cur.count >= options.perDay) {
            (0, funnel_tracker_1.trackFunnelEvent)('rate_limit_hit', {
                endpoint: req.path,
                ip: req.ip?.slice(-6),
                source: 'shared.withFreeLimit',
            });
            res.status(429).json({
                error: 'free_limit_reached',
                message: `Free limit reached (${options.perDay}/day). Upgrade for unlimited access.`
            });
            return;
        }
        cur.count += 1;
        DAILY_COUNTER.set(key, cur);
        next();
    };
}
function getFreeLimitKey(req) {
    return getExternalUserId(req) || req.ip || 'unknown';
}
//# sourceMappingURL=http-middleware.js.map
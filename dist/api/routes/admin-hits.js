"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const hitCounter_1 = require("../middleware/hitCounter");
const convex_client_1 = require("../../shared/analytics/convex-client");
const funnel_tracker_1 = require("../../services/botindex/funnel-tracker");
const router = (0, express_1.Router)();
function getAdminId(value) {
    return typeof value === 'string' ? value : null;
}
function parsePositiveNumber(value) {
    if (typeof value !== 'string')
        return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0)
        return undefined;
    return parsed;
}
function toPercent(numerator, denominator) {
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
        return '0.0%';
    }
    return `${((numerator / denominator) * 100).toFixed(1)}%`;
}
router.get('/botindex/admin/hits', (req, res) => {
    const adminId = getAdminId(req.query.adminId);
    if (adminId !== '8063432083') {
        res.status(403).json({ error: 'unauthorized' });
        return;
    }
    res.json((0, hitCounter_1.getHits)());
});
router.get('/botindex/admin/analytics', async (req, res) => {
    const adminId = getAdminId(req.query.adminId);
    if (adminId !== '8063432083') {
        res.status(403).json({ error: 'unauthorized' });
        return;
    }
    const store = (0, convex_client_1.getOptionalConvexAnalyticsStore)();
    if (!store) {
        res.status(503).json({
            error: 'convex_unavailable',
            message: 'Convex analytics is not configured.',
        });
        return;
    }
    const sinceHours = parsePositiveNumber(req.query.sinceHours);
    const bucketMs = parsePositiveNumber(req.query.bucketMs);
    const walletLimit = parsePositiveNumber(req.query.walletLimit);
    const sinceTimestamp = typeof sinceHours === 'number' ? Date.now() - Math.floor(sinceHours * 60 * 60 * 1000) : undefined;
    try {
        const [analytics, walletCRM] = await Promise.all([
            store.getAnalytics({ sinceTimestamp, bucketMs }),
            store.getWalletCRM({ limit: walletLimit }),
        ]);
        res.json({
            generatedAt: new Date().toISOString(),
            analytics,
            walletCRM,
        });
    }
    catch (error) {
        res.status(502).json({
            error: 'analytics_query_failed',
            message: error instanceof Error ? error.message : 'Failed to query Convex analytics',
        });
    }
});
router.get('/botindex/admin/funnel', (req, res) => {
    const adminId = getAdminId(req.query.adminId);
    if (adminId !== '8063432083') {
        res.status(403).json({ error: 'unauthorized' });
        return;
    }
    const summary = (0, funnel_tracker_1.getFunnelSummary)();
    const total = (step) => summary[step]?.total || 0;
    const keyIssued = total('key_issued');
    const firstAuthCall = total('first_auth_call');
    const paywallHit = total('paywall_hit');
    const checkoutRedirect = total('checkout_redirect');
    const stripeWebhook = total('stripe_webhook_received');
    res.json({
        summary,
        conversion_rates: {
            key_issued_to_first_call: toPercent(firstAuthCall, keyIssued),
            first_call_to_paywall: toPercent(paywallHit, firstAuthCall),
            paywall_to_checkout: toPercent(checkoutRedirect, paywallHit),
            checkout_to_paid: toPercent(stripeWebhook, checkoutRedirect),
            overall_free_to_paid: toPercent(stripeWebhook, keyIssued),
        },
        recentEvents: (0, funnel_tracker_1.getRecentEvents)(undefined, 20),
    });
});
router.get('/botindex/admin/funnel/events', (req, res) => {
    const adminId = getAdminId(req.query.adminId);
    if (adminId !== '8063432083') {
        res.status(403).json({ error: 'unauthorized' });
        return;
    }
    const step = typeof req.query.step === 'string' ? req.query.step : undefined;
    const limit = parsePositiveNumber(req.query.limit);
    res.json({
        events: (0, funnel_tracker_1.getRecentEvents)(step, limit),
    });
});
exports.default = router;
//# sourceMappingURL=admin-hits.js.map
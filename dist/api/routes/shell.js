"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const access_control_1 = require("../../shared/payments/access-control");
const config_1 = require("../../shared/payments/config");
const feature_flags_1 = require("../../shared/shell/feature-flags");
const types_1 = require("../../shared/shell/types");
const router = (0, express_1.Router)();
function badRequest(res, details) {
    return res.status(400).json({
        error: 'invalid_request',
        message: details,
    });
}
function formatZodError(error) {
    return error.issues.map(issue => `${issue.path.join('.') || 'query'}: ${issue.message}`).join('; ');
}
router.use('/:app/shell', (req, res, next) => {
    const parsed = types_1.AppIdSchema.safeParse(req.params.app);
    if (!parsed.success) {
        return badRequest(res, 'Unsupported app id');
    }
    req.appId = parsed.data;
    next();
});
router.get('/:app/shell/feature-flags', (req, res) => {
    res.json({
        app: req.appId,
        ...(0, feature_flags_1.getShellFeatureFlags)(),
        timestamp: new Date().toISOString(),
    });
});
router.get('/:app/shell/signal-summary', (req, res) => {
    const gate = (0, feature_flags_1.assertFeatureEnabled)('signalSummary');
    if (!gate.enabled)
        return res.status(404).json({ error: 'feature_not_enabled', phase: gate.snapshot.phase });
    const parsed = types_1.SummaryQuerySchema.safeParse(req.query);
    if (!parsed.success) {
        return badRequest(res, formatZodError(parsed.error));
    }
    const { windowHours } = parsed.data;
    res.json({
        app: req.appId,
        period: {
            hours: windowHours,
            startedAt: new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString(),
            endedAt: new Date().toISOString(),
        },
        metrics: {
            totalSignals: 0,
            highConfidenceSignals: 0,
            buySignals: 0,
            sellSignals: 0,
            holdSignals: 0,
            hitRate: 0,
        },
        source: 'bootstrap',
        featurePhase: gate.snapshot.phase,
    });
});
router.get('/:app/shell/opportunity-timeline', (req, res) => {
    const gate = (0, feature_flags_1.assertFeatureEnabled)('opportunityTimeline');
    if (!gate.enabled)
        return res.status(404).json({ error: 'feature_not_enabled', phase: gate.snapshot.phase });
    const parsed = types_1.TimelineQuerySchema.safeParse(req.query);
    if (!parsed.success) {
        return badRequest(res, formatZodError(parsed.error));
    }
    const { days, limit } = parsed.data;
    const now = Date.now();
    const timeline = Array.from({ length: Math.min(days, limit) }).map((_, idx) => ({
        id: `op-${idx + 1}`,
        at: new Date(now - idx * 24 * 60 * 60 * 1000).toISOString(),
        type: 'observation',
        summary: 'No active opportunity snapshot yet',
        value: 0,
        currency: 'usd',
        confidence: 0,
        status: 'placeholder',
    }));
    res.json({
        app: req.appId,
        timeline,
        count: timeline.length,
        featurePhase: gate.snapshot.phase,
    });
});
router.get('/:app/shell/entitlement-status', async (req, res) => {
    const gate = (0, feature_flags_1.assertFeatureEnabled)('entitlementStatus');
    if (!gate.enabled)
        return res.status(404).json({ error: 'feature_not_enabled', phase: gate.snapshot.phase });
    const parsed = types_1.EntitlementQuerySchema.safeParse(req.query);
    if (!parsed.success) {
        return badRequest(res, formatZodError(parsed.error));
    }
    try {
        const appId = req.appId;
        const status = await (0, access_control_1.getSubscriptionStatus)(appId, parsed.data.userId);
        res.json({
            app: appId,
            userId: parsed.data.userId,
            tier: status.tier,
            status: status.status,
            features: status.features,
            limits: status.limits,
            currentPeriodEnd: status.currentPeriodEnd ?? null,
            featurePhase: gate.snapshot.phase,
        });
    }
    catch (err) {
        return res.status(500).json({ error: 'entitlement_lookup_failed', message: err?.message || 'Unknown error' });
    }
});
router.get('/:app/shell/pricing-metadata', (req, res) => {
    const gate = (0, feature_flags_1.assertFeatureEnabled)('pricingMetadata');
    if (!gate.enabled)
        return res.status(404).json({ error: 'feature_not_enabled', phase: gate.snapshot.phase });
    try {
        const appId = req.appId;
        const tiers = (0, config_1.getAvailableTiers)(appId);
        res.json({
            app: appId,
            stripeConfigured: (0, config_1.isStripeConfigured)(appId),
            tiers: tiers.map(t => ({
                id: t.id,
                name: t.name,
                price: t.price,
                currency: t.currency,
                interval: t.interval,
                features: t.features,
                limits: t.limits,
            })),
            featurePhase: gate.snapshot.phase,
        });
    }
    catch (err) {
        return res.status(500).json({ error: 'pricing_metadata_failed', message: err?.message || 'Unknown error' });
    }
});
router.get('/:app/shell/status-block', async (req, res) => {
    const gate = (0, feature_flags_1.assertFeatureEnabled)('dashboardStatusBlock');
    if (!gate.enabled)
        return res.status(404).json({ error: 'feature_not_enabled', phase: gate.snapshot.phase });
    const appId = req.appId;
    res.json({
        app: appId,
        service: {
            status: 'healthy',
            environment: process.env.NODE_ENV || 'development',
            timestamp: new Date().toISOString(),
            version: process.env.npm_package_version || 'unknown',
        },
        rollout: gate.snapshot,
        dependencies: {
            stripeConfigured: (0, config_1.isStripeConfigured)(appId),
            supabaseConfigured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY),
            redisConfigured: Boolean(process.env.REDIS_URL),
        },
    });
});
exports.default = router;
//# sourceMappingURL=shell.js.map
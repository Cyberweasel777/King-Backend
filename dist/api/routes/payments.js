"use strict";
/**
 * Payment Routes
 * Express router for payment endpoints per app
 * Mounted at /api/:app/payments
 */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const access_control_1 = require("../../shared/payments/access-control");
const stripe_client_1 = require("../../shared/payments/stripe-client");
const webhook_handler_1 = require("../../shared/payments/webhook-handler");
const database_1 = require("../../shared/payments/database");
const config_1 = require("../../shared/payments/config");
const router = (0, express_1.Router)();
// Middleware to extract app ID from params
const extractAppId = (req, res, next) => {
    const appId = req.params.app;
    const validApps = [
        'spreadhunter', 'deckvault', 'packpal', 'dropfarm', 'dropscout',
        'launchradar', 'memeradar', 'memestock', 'nftpulse', 'pointtrack',
        'rosterradar', 'skinsignal', 'socialindex', 'botindex', 'arbwatch'
    ];
    if (!validApps.includes(appId)) {
        return res.status(400).json({ error: 'Invalid app ID' });
    }
    req.appId = appId;
    next();
};
/**
 * GET /api/:app/payments/config
 * Get available tiers and pricing
 */
router.get('/:app/payments/config', extractAppId, async (req, res) => {
    const appId = req.appId;
    try {
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
            })),
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/**
 * GET /api/:app/payments/status
 * Get current user's subscription status
 */
router.get('/:app/payments/status', extractAppId, async (req, res) => {
    const appId = req.appId;
    const externalUserId = req.query.userId;
    if (!externalUserId) {
        return res.status(400).json({ error: 'Missing userId parameter' });
    }
    try {
        const status = await (0, access_control_1.getSubscriptionStatus)(appId, externalUserId);
        res.json(status);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/**
 * GET /api/:app/payments/referral/code
 * Get or create referral code for user
 */
router.get('/:app/payments/referral/code', extractAppId, async (req, res) => {
    const appId = req.appId;
    const externalUserId = req.query.userId;
    if (!externalUserId) {
        return res.status(400).json({ error: 'Missing userId parameter' });
    }
    try {
        const referral = await (0, database_1.getOrCreateReferralCode)(appId, externalUserId);
        res.json({
            app: appId,
            externalUserId,
            code: referral.code,
            shareText: `Use my code ${referral.code} at checkout`,
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/**
 * GET /api/:app/payments/referral/stats
 * Get referral conversion stats for user
 */
router.get('/:app/payments/referral/stats', extractAppId, async (req, res) => {
    const appId = req.appId;
    const externalUserId = req.query.userId;
    if (!externalUserId) {
        return res.status(400).json({ error: 'Missing userId parameter' });
    }
    try {
        const stats = await (0, database_1.getReferralStats)(appId, externalUserId);
        res.json(stats);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/**
 * GET /api/:app/payments/referral/validate
 * Validate a referral code
 */
router.get('/:app/payments/referral/validate', extractAppId, async (req, res) => {
    const appId = req.appId;
    const code = (req.query.code || '').trim();
    if (!code) {
        return res.status(400).json({ error: 'Missing code parameter' });
    }
    try {
        const referral = await (0, database_1.resolveReferralCode)(appId, code);
        res.json({ valid: !!referral });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/**
 * POST /api/:app/payments/checkout
 * Create checkout session
 */
router.post('/:app/payments/checkout', extractAppId, async (req, res) => {
    const appId = req.appId;
    const { externalUserId, tier, successUrl, cancelUrl, email, referralCode } = req.body;
    if (!externalUserId || !tier || !successUrl || !cancelUrl) {
        return res.status(400).json({
            error: 'Missing required fields: externalUserId, tier, successUrl, cancelUrl'
        });
    }
    try {
        const session = await (0, stripe_client_1.createCheckoutSession)(appId, {
            externalUserId,
            tier,
            successUrl,
            cancelUrl,
            email,
            referralCode,
        });
        res.json(session);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/**
 * POST /api/:app/payments/portal
 * Create customer portal session
 */
router.post('/:app/payments/portal', extractAppId, async (req, res) => {
    const appId = req.appId;
    const { externalUserId, returnUrl } = req.body;
    if (!externalUserId || !returnUrl) {
        return res.status(400).json({ error: 'Missing externalUserId or returnUrl' });
    }
    try {
        const url = await (0, stripe_client_1.createPortalSession)(appId, {
            externalUserId,
            returnUrl,
        });
        res.json({ url });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/**
 * POST /api/:app/payments/webhook
 * Stripe webhook handler
 */
router.post('/:app/payments/webhook', extractAppId, async (req, res) => {
    const appId = req.appId;
    const signature = req.headers['stripe-signature'];
    if (!signature) {
        return res.status(400).json({ error: 'Missing stripe-signature header' });
    }
    // Get raw body for signature verification
    const payload = req.body;
    const event = (0, webhook_handler_1.verifyWebhookPayload)(appId, payload, signature);
    if (!event) {
        return res.status(400).json({ error: 'Invalid signature' });
    }
    try {
        const result = await (0, webhook_handler_1.handleWebhookEvent)(appId, event);
        res.json(result);
    }
    catch (err) {
        console.error(`Webhook error for ${appId}:`, err);
        // Still return 200 to prevent Stripe retries
        res.json({ processed: false, message: err.message });
    }
});
/**
 * GET /api/:app/payments/admin/stats
 * Admin: Get payment stats
 */
router.get('/:app/payments/admin/stats', extractAppId, async (req, res) => {
    const appId = req.appId;
    const adminUserId = req.query.adminId;
    const days = parseInt(req.query.days) || 30;
    if (!(0, config_1.isAdmin)(adminUserId)) {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    try {
        const stats = await (0, database_1.getAppPaymentStats)(appId, days);
        const recentEvents = await (0, database_1.getRecentPaymentEvents)(appId, 10);
        // Calculate percentages
        const byTierWithPct = {};
        for (const [tier, count] of Object.entries(stats.byTier)) {
            byTierWithPct[tier] = {
                count,
                percentage: stats.totalUsers > 0 ? (count / stats.totalUsers) * 100 : 0,
            };
        }
        res.json({
            app: appId,
            period: `${days}d`,
            summary: {
                totalUsers: stats.totalUsers,
                activeSubscriptions: stats.activeSubscriptions,
                mrr: stats.mrr,
                currency: 'usd',
            },
            byTier: byTierWithPct,
            recentEvents,
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/**
 * POST /api/:app/payments/admin/grant
 * Admin: Grant subscription manually
 */
router.post('/:app/payments/admin/grant', extractAppId, async (req, res) => {
    const appId = req.appId;
    const { adminId, externalUserId, tier, durationDays } = req.body;
    if (!(0, config_1.isAdmin)(adminId)) {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    try {
        const subscription = await (0, database_1.grantSubscription)(appId, externalUserId, tier, durationDays || 30);
        res.json({
            success: true,
            subscription: {
                appId: subscription.appId,
                externalUserId: subscription.externalUserId,
                tier: subscription.tier,
                status: subscription.status,
                currentPeriodEnd: subscription.currentPeriodEnd,
            },
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/**
 * POST /api/:app/payments/admin/revoke
 * Admin: Revoke subscription
 */
router.post('/:app/payments/admin/revoke', extractAppId, async (req, res) => {
    const appId = req.appId;
    const { adminId, externalUserId } = req.body;
    if (!(0, config_1.isAdmin)(adminId)) {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    try {
        const subscription = await (0, database_1.revokeSubscription)(appId, externalUserId);
        res.json({
            success: true,
            subscription: {
                appId: subscription.appId,
                externalUserId: subscription.externalUserId,
                tier: subscription.tier,
                status: subscription.status,
            },
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.default = router;
//# sourceMappingURL=payments.js.map
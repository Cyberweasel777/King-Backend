"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const stripe_1 = __importDefault(require("stripe"));
const zod_1 = require("zod");
const logger_1 = __importDefault(require("../../config/logger"));
const apiKeyAuth_1 = require("../middleware/apiKeyAuth");
const router = (0, express_1.Router)();
const SUCCESS_URL = 'https://king-backend.fly.dev/api/botindex/keys/success?session_id={CHECKOUT_SESSION_ID}';
const CANCEL_URL = 'https://king-backend.fly.dev/api/botindex/keys/cancel';
const PORTAL_RETURN_URL = 'https://king-backend.fly.dev/api/botindex/keys/cancel';
const registerSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    plan: zod_1.z.enum(['basic', 'pro']).optional(),
});
function getStripeClient() {
    const stripeSecretKey = process.env.BOTINDEX_STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
        throw new Error('BOTINDEX_STRIPE_SECRET_KEY is not configured');
    }
    return new stripe_1.default(stripeSecretKey, { apiVersion: '2025-02-24.acacia' });
}
function getPlanPriceId(plan) {
    const basic = process.env.BOTINDEX_STRIPE_PRICE_BASIC;
    const pro = process.env.BOTINDEX_STRIPE_PRICE_PRO;
    const byPlan = {
        basic,
        pro,
    };
    const priceId = byPlan[plan];
    if (!priceId) {
        throw new Error(`Missing Stripe price ID for plan "${plan}"`);
    }
    return priceId;
}
function resolvePlanFromSession(session) {
    const plan = session.metadata?.plan;
    if (plan === 'pro')
        return 'pro';
    if (plan === 'basic')
        return 'basic';
    return 'basic';
}
async function resolveEmailFromSession(stripe, session) {
    const fromSession = session.customer_details?.email || session.metadata?.email;
    if (fromSession)
        return fromSession;
    const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
    if (!customerId)
        return null;
    const customer = await stripe.customers.retrieve(customerId);
    if (typeof customer === 'string' || customer.deleted) {
        return null;
    }
    return customer.email || null;
}
router.post('/register', async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({
            error: 'invalid_payload',
            message: parsed.error.issues[0]?.message || 'Invalid registration payload',
        });
        return;
    }
    try {
        const stripe = getStripeClient();
        const plan = parsed.data.plan || 'basic';
        const priceId = getPlanPriceId(plan);
        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            customer_email: parsed.data.email,
            payment_method_types: ['card'],
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: SUCCESS_URL,
            cancel_url: CANCEL_URL,
            metadata: {
                email: parsed.data.email,
                plan,
            },
        });
        if (!session.url) {
            res.status(500).json({ error: 'checkout_session_failed', message: 'Stripe did not return a checkout URL' });
            return;
        }
        res.json({
            checkoutUrl: session.url,
            sessionId: session.id,
        });
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Failed to create BotIndex key checkout session');
        res.status(500).json({ error: 'checkout_session_failed', message: 'Unable to create checkout session' });
    }
});
router.get('/success', async (req, res) => {
    const sessionId = typeof req.query.session_id === 'string' ? req.query.session_id : '';
    if (!sessionId) {
        res.status(400).json({ error: 'missing_session_id', message: 'session_id query parameter is required' });
        return;
    }
    try {
        const stripe = getStripeClient();
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
        if (!customerId) {
            res.status(400).json({ error: 'invalid_session', message: 'Checkout session has no Stripe customer' });
            return;
        }
        if (session.status !== 'complete') {
            res.status(400).json({ error: 'checkout_incomplete', message: 'Checkout session is not complete' });
            return;
        }
        const email = await resolveEmailFromSession(stripe, session);
        if (!email) {
            res.status(400).json({ error: 'missing_email', message: 'No customer email found for checkout session' });
            return;
        }
        const plan = resolvePlanFromSession(session);
        const apiKey = (0, apiKeyAuth_1.generateApiKey)();
        (0, apiKeyAuth_1.createApiKeyEntry)({
            apiKey,
            email,
            stripeCustomerId: customerId,
            plan,
        });
        res.json({
            apiKey,
            plan,
            message: "Save this key - it won't be shown again",
        });
    }
    catch (error) {
        logger_1.default.error({ err: error, sessionId }, 'Failed to finalize BotIndex key checkout session');
        res.status(500).json({ error: 'session_finalize_failed', message: 'Unable to finalize checkout session' });
    }
});
router.get('/info', apiKeyAuth_1.requireApiKey, (req, res) => {
    const auth = req.apiKeyAuth;
    if (!auth) {
        res.status(401).json({ error: 'invalid_api_key', message: 'Valid X-API-Key header is required.' });
        return;
    }
    const entry = (0, apiKeyAuth_1.getApiKeyEntry)(auth.apiKey);
    if (!entry) {
        res.status(401).json({ error: 'invalid_api_key', message: 'Valid X-API-Key header is required.' });
        return;
    }
    res.json({
        plan: entry.plan,
        requestCount: entry.requestCount,
        createdAt: entry.createdAt,
        status: entry.status,
    });
});
router.post('/portal', apiKeyAuth_1.requireApiKey, async (req, res) => {
    const auth = req.apiKeyAuth;
    if (!auth) {
        res.status(401).json({ error: 'invalid_api_key', message: 'Valid X-API-Key header is required.' });
        return;
    }
    const entry = (0, apiKeyAuth_1.getApiKeyEntry)(auth.apiKey);
    if (!entry) {
        res.status(401).json({ error: 'invalid_api_key', message: 'Valid X-API-Key header is required.' });
        return;
    }
    if (!entry.stripeCustomerId) {
        res.status(400).json({ error: 'missing_customer', message: 'No Stripe customer associated with this API key' });
        return;
    }
    try {
        const stripe = getStripeClient();
        const portalSession = await stripe.billingPortal.sessions.create({
            customer: entry.stripeCustomerId,
            return_url: PORTAL_RETURN_URL,
        });
        res.json({ portalUrl: portalSession.url });
    }
    catch (error) {
        logger_1.default.error({ err: error, apiKey: auth.apiKey }, 'Failed to create BotIndex billing portal session');
        res.status(500).json({ error: 'portal_session_failed', message: 'Unable to create billing portal session' });
    }
});
router.get('/cancel', (_req, res) => {
    res.json({ message: 'Checkout cancelled. Return to API docs to try again.' });
});
exports.default = router;
//# sourceMappingURL=botindex-keys.js.map
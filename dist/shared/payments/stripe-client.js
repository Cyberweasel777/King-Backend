"use strict";
/**
 * Stripe Client
 * Creates checkout sessions and manages Stripe API
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStripeClient = getStripeClient;
exports.createCheckoutSession = createCheckoutSession;
exports.createPortalSession = createPortalSession;
exports.getStripeSubscription = getStripeSubscription;
exports.cancelStripeSubscription = cancelStripeSubscription;
const stripe_1 = __importDefault(require("stripe"));
const config_1 = require("./config");
const database_1 = require("./database");
/**
 * Get Stripe client for an app
 */
function getStripeClient(appId) {
    const secretKey = (0, config_1.getStripeSecretKey)(appId);
    if (!secretKey) {
        return null;
    }
    return new stripe_1.default(secretKey, { apiVersion: '2025-02-24.acacia' });
}
/**
 * Create a checkout session for subscription
 */
async function createCheckoutSession(appId, request) {
    const stripe = getStripeClient(appId);
    if (!stripe) {
        throw new Error(`Stripe not configured for ${appId}`);
    }
    const normalizedTier = appId === 'arbwatch' && request.tier === 'basic' ? 'starter' : request.tier;
    (0, config_1.getTierConfig)(appId, normalizedTier);
    const priceId = (0, config_1.getStripePriceId)(appId, normalizedTier);
    if (!priceId) {
        throw new Error(`No price configured for ${appId} tier ${normalizedTier}`);
    }
    let referralCode;
    if (request.referralCode) {
        const referral = await (0, database_1.resolveReferralCode)(appId, request.referralCode);
        if (referral && referral.externalUserId !== request.externalUserId) {
            referralCode = referral.code;
        }
    }
    // Create or retrieve customer
    let customerId;
    // Check if customer exists
    const { data: existingSub } = await stripe.customers.search({
        query: `metadata['external_user_id']:'${request.externalUserId}' AND metadata['app_id']:'${appId}'`,
    });
    if (existingSub && existingSub.length > 0) {
        customerId = existingSub[0].id;
    }
    else {
        // Create new customer
        const customer = await stripe.customers.create({
            email: request.email,
            metadata: {
                external_user_id: request.externalUserId,
                app_id: appId,
            },
        });
        customerId = customer.id;
    }
    // Create checkout session
    const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [
            {
                price: priceId,
                quantity: 1,
            },
        ],
        mode: 'subscription',
        success_url: request.successUrl,
        cancel_url: request.cancelUrl,
        subscription_data: {
            metadata: {
                external_user_id: request.externalUserId,
                app_id: appId,
                tier: normalizedTier,
                ...(referralCode ? { referral_code: referralCode } : {}),
                ...request.metadata,
            },
        },
        metadata: {
            external_user_id: request.externalUserId,
            app_id: appId,
            tier: normalizedTier,
            ...(referralCode ? { referral_code: referralCode } : {}),
        },
    });
    return {
        sessionId: session.id,
        url: session.url || '',
    };
}
/**
 * Create customer portal session
 */
async function createPortalSession(appId, request) {
    const stripe = getStripeClient(appId);
    if (!stripe) {
        throw new Error(`Stripe not configured for ${appId}`);
    }
    // Find customer by external_user_id
    const { data: customers } = await stripe.customers.search({
        query: `metadata['external_user_id']:'${request.externalUserId}' AND metadata['app_id']:'${appId}'`,
    });
    if (!customers || customers.length === 0) {
        throw new Error('No subscription found');
    }
    const customerId = customers[0].id;
    const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: request.returnUrl,
    });
    return session.url;
}
/**
 * Get subscription details from Stripe
 */
async function getStripeSubscription(appId, subscriptionId) {
    const stripe = getStripeClient(appId);
    if (!stripe)
        return null;
    try {
        return await stripe.subscriptions.retrieve(subscriptionId);
    }
    catch {
        return null;
    }
}
/**
 * Cancel subscription in Stripe
 */
async function cancelStripeSubscription(appId, subscriptionId) {
    const stripe = getStripeClient(appId);
    if (!stripe)
        return false;
    try {
        await stripe.subscriptions.cancel(subscriptionId);
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=stripe-client.js.map
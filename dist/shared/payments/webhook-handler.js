"use strict";
/**
 * Stripe Webhook Handler
 * Processes Stripe events and updates subscriptions
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyWebhookPayload = verifyWebhookPayload;
exports.handleWebhookEvent = handleWebhookEvent;
const stripe_1 = __importDefault(require("stripe"));
const config_1 = require("./config");
const database_1 = require("./database");
const meta_capi_1 = require("./meta-capi");
const logger_1 = require("../../utils/logger");
const funnel_tracker_1 = require("../../services/botindex/funnel-tracker");
/**
 * Verify and parse Stripe webhook payload
 */
function verifyWebhookPayload(appId, payload, signature) {
    const secret = (0, config_1.getStripeWebhookSecret)(appId);
    if (!secret) {
        logger_1.logger.error({ appId }, 'No webhook secret configured');
        return null;
    }
    const secretKey = (0, config_1.getStripeSecretKey)(appId);
    if (!secretKey)
        return null;
    const stripe = new stripe_1.default(secretKey, { apiVersion: '2025-02-24.acacia' });
    try {
        return stripe.webhooks.constructEvent(payload, signature, secret);
    }
    catch (err) {
        logger_1.logger.error({ appId, error: err.message }, 'Webhook signature verification failed');
        return null;
    }
}
/**
 * Handle Stripe webhook event
 */
async function handleWebhookEvent(appId, event) {
    // Record event first (for audit/metrics)
    const tier = normalizeTierForApp(appId, extractTierFromEvent(event));
    const amount = extractAmountFromEvent(event);
    const currency = extractCurrencyFromEvent(event);
    // Record the event (idempotent)
    await (0, database_1.recordPaymentEvent)({
        appId,
        eventType: event.type,
        stripeEventId: event.id,
        externalUserId: extractExternalUserId(event),
        amount,
        currency,
        tier,
        metadata: {
            stripe_event_type: event.type,
            ...event.data.object,
        },
    });
    switch (event.type) {
        case 'checkout.session.completed':
            return handleCheckoutCompleted(appId, event);
        case 'invoice.payment_succeeded':
            return handleInvoicePaymentSucceeded(appId, event);
        case 'invoice.payment_failed':
            return handleInvoicePaymentFailed(appId, event);
        case 'customer.subscription.deleted':
            return handleSubscriptionDeleted(appId, event);
        case 'customer.subscription.updated':
            return handleSubscriptionUpdated(appId, event);
        default:
            return { processed: false, message: `Unhandled event type: ${event.type}` };
    }
}
/**
 * Handle checkout.session.completed
 * New subscription started
 */
async function handleCheckoutCompleted(appId, event) {
    const session = event.data.object;
    const externalUserId = session.metadata?.external_user_id;
    const tier = normalizeTierForApp(appId, session.metadata?.tier);
    if (!externalUserId || !tier) {
        return { processed: false, message: 'Missing metadata in checkout session' };
    }
    if (appId === 'botindex') {
        (0, funnel_tracker_1.trackFunnelEvent)('stripe_webhook_received', {
            plan: tier,
            email: session.customer_email || session.customer_details?.email || null,
            source: 'shared.payments.webhook',
        });
    }
    // Get subscription details
    const stripeSubId = session.subscription;
    const stripeCustomerId = session.customer;
    // Update database
    await (0, database_1.upsertSubscription)(appId, externalUserId, {
        stripeCustomerId,
        stripeSubscriptionId: stripeSubId,
        tier,
        status: 'active',
    });
    // Capture referral conversion when present
    const referralCode = session.metadata?.referral_code;
    if (referralCode) {
        await (0, database_1.recordReferralConversion)({
            appId,
            referralCode,
            referredExternalUserId: externalUserId,
            checkoutSessionId: session.id,
            stripeCustomerId,
            stripeSubscriptionId: stripeSubId,
            rewardMonths: 1,
            payoutCents: 0,
            metadata: { tier },
        });
    }
    // Send Meta CAPI event (optional)
    if (session.customer_details?.email) {
        await (0, meta_capi_1.sendMetaCapiEvent)(appId, {
            eventName: 'Purchase',
            externalUserId,
            email: session.customer_details.email,
            value: extractAmountFromEvent(event),
            currency: extractCurrencyFromEvent(event),
        });
    }
    return { processed: true, message: `Subscription created: ${tier}` };
}
/**
 * Handle invoice.payment_succeeded
 * Recurring payment received
 */
async function handleInvoicePaymentSucceeded(appId, event) {
    const invoice = event.data.object;
    const stripeCustomerId = invoice.customer;
    const stripeSubId = invoice.subscription;
    // Get subscription to find external_user_id
    const existingSub = await (0, database_1.getSubscriptionByStripeCustomer)(stripeCustomerId);
    if (!existingSub) {
        return { processed: false, message: 'Subscription not found' };
    }
    // Check if this is the first invoice (skip to avoid double-counting)
    const isFirstInvoice = invoice.billing_reason === 'subscription_create';
    if (!isFirstInvoice) {
        // Update period end
        await (0, database_1.updateSubscriptionFromStripe)(stripeCustomerId, {
            status: 'active',
        });
        // Send Meta CAPI event for recurring
        if (existingSub) {
            await (0, meta_capi_1.sendMetaCapiEvent)(appId, {
                eventName: 'Purchase',
                externalUserId: existingSub.externalUserId,
                value: extractAmountFromEvent(event),
                currency: extractCurrencyFromEvent(event),
            });
        }
    }
    return {
        processed: true,
        message: isFirstInvoice ? 'First invoice - skipped' : 'Recurring payment recorded'
    };
}
/**
 * Handle invoice.payment_failed
 * Payment failed - mark as past_due
 */
async function handleInvoicePaymentFailed(appId, event) {
    const invoice = event.data.object;
    const stripeCustomerId = invoice.customer;
    await (0, database_1.updateSubscriptionFromStripe)(stripeCustomerId, {
        status: 'past_due',
    });
    return { processed: true, message: 'Subscription marked past_due' };
}
/**
 * Handle customer.subscription.deleted
 * Subscription canceled
 */
async function handleSubscriptionDeleted(appId, event) {
    const subscription = event.data.object;
    const stripeCustomerId = subscription.customer;
    await (0, database_1.updateSubscriptionFromStripe)(stripeCustomerId, {
        tier: 'free',
        status: 'canceled',
        stripeSubscriptionId: undefined,
        currentPeriodEnd: undefined,
    });
    return { processed: true, message: 'Subscription canceled' };
}
/**
 * Handle customer.subscription.updated
 * Subscription changed (tier, status, etc)
 */
async function handleSubscriptionUpdated(appId, event) {
    const subscription = event.data.object;
    const stripeCustomerId = subscription.customer;
    const status = mapStripeStatus(subscription.status);
    const periodEnd = subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000)
        : undefined;
    await (0, database_1.updateSubscriptionFromStripe)(stripeCustomerId, {
        status,
        currentPeriodEnd: periodEnd,
    });
    return { processed: true, message: 'Subscription updated' };
}
// Helpers
function extractExternalUserId(event) {
    const obj = event.data.object;
    return obj.metadata?.external_user_id ||
        obj.customer_details?.external_user_id ||
        obj.customer?.metadata?.external_user_id;
}
function extractTierFromEvent(event) {
    const obj = event.data.object;
    return obj.metadata?.tier ||
        obj.subscription_details?.metadata?.tier;
}
function normalizeTierForApp(appId, tier) {
    if (!tier)
        return undefined;
    if (appId === 'arbwatch' && tier === 'basic')
        return 'starter';
    if (appId === 'arbwatch' && tier === 'enterprise')
        return 'elite';
    return tier;
}
function extractAmountFromEvent(event) {
    const obj = event.data.object;
    return obj.amount_total ||
        obj.amount_paid ||
        obj.amount;
}
function extractCurrencyFromEvent(event) {
    const obj = event.data.object;
    return obj.currency;
}
function mapStripeStatus(stripeStatus) {
    switch (stripeStatus) {
        case 'active':
        case 'trialing':
            return 'active';
        case 'past_due':
        case 'unpaid':
            return 'past_due';
        case 'canceled':
        case 'incomplete_expired':
            return 'canceled';
        default:
            return 'inactive';
    }
}
function getAppIdFromEnv(appId) {
    const validApps = [
        'spreadhunter', 'deckvault', 'packpal', 'dropfarm', 'dropscout',
        'launchradar', 'memeradar', 'memestock', 'nftpulse', 'pointtrack',
        'rosterradar', 'skinsignal', 'socialindex', 'botindex', 'arbwatch'
    ];
    return validApps.includes(appId) ? appId : null;
}
//# sourceMappingURL=webhook-handler.js.map
"use strict";
/**
 * Bot Payment Guard Middleware
 * Telegram/Discord bot subscription checking
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.withSubscription = withSubscription;
exports.checkSubscription = checkSubscription;
exports.createStatusCommand = createStatusCommand;
exports.createPricingCommand = createPricingCommand;
exports.createSubscribeCommand = createSubscribeCommand;
const payments_1 = require("../../shared/payments");
const config_1 = require("../../shared/payments/config");
/**
 * Middleware: Require subscription tier
 * Usage: bot.command('premium', withSubscription('appId', 'pro'), handler)
 */
function withSubscription(appId, minimumTier = 'basic') {
    return async (ctx, next) => {
        const externalUserId = ctx.from?.id.toString();
        if (!externalUserId) {
            await ctx.reply('❌ Unable to identify user.');
            return;
        }
        const hasAccess = await (0, payments_1.isSubscribed)(appId, externalUserId, minimumTier);
        if (!hasAccess) {
            await sendUpgradePrompt(ctx, appId, minimumTier);
            return;
        }
        await next();
    };
}
/**
 * Check subscription without middleware (for inline checks)
 */
async function checkSubscription(appId, ctx, minimumTier = 'basic') {
    const externalUserId = ctx.from?.id.toString();
    if (!externalUserId)
        return false;
    return (0, payments_1.isSubscribed)(appId, externalUserId, minimumTier);
}
/**
 * Send upgrade prompt with payment link
 */
async function sendUpgradePrompt(ctx, appId, requiredTier) {
    const userId = ctx.from?.id.toString() || '';
    const tiers = (0, config_1.getAvailableTiers)(appId);
    let message = `🔒 *Premium Feature Required*\n\n`;
    message += `This command requires the *${requiredTier.toUpperCase()}* tier or higher.\n\n`;
    message += `*Choose a plan:*\n\n`;
    for (const tier of tiers) {
        if (tier.id === 'free')
            continue;
        const price = tier.price === 0 ? 'Free' : `$${(tier.price / 100).toFixed(2)}/${tier.interval}`;
        message += `*${tier.name}* - ${price}\n`;
        message += tier.features.slice(0, 3).map(f => `  ✓ ${f}`).join('\n');
        message += '\n\n';
    }
    // Build checkout URL using the global payments endpoint
    const baseUrl = process.env.API_BASE_URL || 'https://king-backend.fly.dev';
    const checkoutUrl = `${baseUrl}/api/payments/checkout?app=${appId}&tier=${requiredTier}&user=${encodeURIComponent(userId)}`;
    await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '💳 Upgrade Now', url: checkoutUrl }],
                [{ text: '📋 View All Plans', callback_data: `pricing_${appId}` }],
            ],
        },
    });
}
/**
 * Command handler: /status
 * Show user's current subscription status
 */
function createStatusCommand(appId) {
    return async (ctx) => {
        const externalUserId = ctx.from?.id.toString();
        if (!externalUserId) {
            await ctx.reply('❌ Unable to identify user.');
            return;
        }
        try {
            const status = await (0, payments_1.getSubscriptionStatus)(appId, externalUserId);
            const message = (0, payments_1.formatSubscriptionStatus)(status);
            await ctx.reply(message, { parse_mode: 'Markdown' });
        }
        catch (err) {
            await ctx.reply(`❌ Error: ${err.message}`);
        }
    };
}
/**
 * Command handler: /pricing
 * Show pricing tiers
 */
function createPricingCommand(appId) {
    return async (ctx) => {
        const message = (0, payments_1.getTierComparison)(appId);
        const userId = ctx.from?.id.toString() || '';
        const baseUrl = process.env.API_BASE_URL || 'https://king-backend.fly.dev';
        const checkoutUrl = `${baseUrl}/api/payments/checkout?app=${appId}&tier=pro&user=${encodeURIComponent(userId)}`;
        await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '💳 Get Started', url: checkoutUrl }],
                ],
            },
        });
    };
}
/**
 * Command handler: /subscribe
 * Direct link to checkout
 */
function createSubscribeCommand(appId) {
    return async (ctx) => {
        const userId = ctx.from?.id.toString() || '';
        const baseUrl = process.env.API_BASE_URL || 'https://king-backend.fly.dev';
        const checkoutUrl = `${baseUrl}/api/payments/checkout?app=${appId}&tier=pro&user=${encodeURIComponent(userId)}`;
        await ctx.reply('Ready to upgrade? Click below to choose your plan:', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '💳 Choose Plan', url: checkoutUrl }],
                ],
            },
        });
    };
}
//# sourceMappingURL=payment-guard.js.map
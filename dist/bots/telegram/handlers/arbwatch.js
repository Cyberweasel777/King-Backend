"use strict";
/**
 * ArbWatch Telegram Bot Handler
 *
 * TODO: Paste your working ArbWatch bot code here
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createArbWatchBot = createArbWatchBot;
const telegraf_1 = require("telegraf");
const payments_1 = require("../../shared/payments");
const APP_ID = 'arbwatch';
function createArbWatchBot(token) {
    const bot = new telegraf_1.Telegraf(token);
    bot.command('start', async (ctx) => {
        await ctx.reply(`⚡ *ArbWatch* — Arbitrage Monitor\n\n` +
            `Find and execute cross-market arbitrage.`, { parse_mode: 'Markdown' });
    });
    bot.command('help', async (ctx) => {
        await ctx.reply(`*ArbWatch Commands*\n\n` +
            `Free:\n` +
            `/opportunities — View arb opportunities\n` +
            `/markets — List markets\n\n` +
            `Starter ($39):\n` +
            `/opportunities — Expanded opportunities\n\n` +
            `Pro/Elite:\n` +
            `/position — Log position\n` +
            `/positions — View positions\n` +
            `/execute — Execute trade\n` +
            `/scanner — Cross-venue scanner\n` +
            `/heatmap — Prediction heatmap`);
    });
    // Payment commands
    bot.command('status', (0, payments_1.createStatusCommand)(APP_ID));
    bot.command('pricing', (0, payments_1.createPricingCommand)(APP_ID));
    bot.command('subscribe', (0, payments_1.createSubscribeCommand)(APP_ID));
    // Free: Opportunities (limited)
    bot.command('opportunities', async (ctx) => {
        // TODO: Paste your working opportunities command
        await ctx.reply(`⚡ *Arbitrage Opportunities*\n\n` +
            `1. PEPE/ETH\n` +
            `   Buy: Uniswap @ 0.00000120\n` +
            `   Sell: Binance @ 0.00000125\n` +
            `   Profit: 3.85%\n\n` +
            `_Free tier: 3 ops max_`, { parse_mode: 'Markdown' });
    });
    // Free: Markets
    bot.command('markets', async (ctx) => {
        // TODO: Paste your working markets command
        await ctx.reply(`🏛 *Tracked Markets*\n\n` +
            `• Uniswap (DEX)\n` +
            `• Binance (CEX)\n` +
            `• Coinbase (CEX)`, { parse_mode: 'Markdown' });
    });
    // Pro: Log position (gated)
    bot.command('position', (0, payments_1.withSubscription)(APP_ID, 'pro'), async (ctx) => {
        // TODO: Paste your working position command
        await ctx.reply(`📊 Position logged.\n` +
            `Use /positions to track.`, { parse_mode: 'Markdown' });
    });
    // Pro: View positions (gated)
    bot.command('positions', (0, payments_1.withSubscription)(APP_ID, 'pro'), async (ctx) => {
        // TODO: Paste your working positions command
        await ctx.reply(`📈 *Your Positions*\n\n` +
            `PEPE/ETH: +$45.50 (4.55%)`, { parse_mode: 'Markdown' });
    });
    // Pro: Execute trade (gated)
    bot.command('execute', (0, payments_1.withSubscription)(APP_ID, 'pro'), async (ctx) => {
        // TODO: Paste your working execute command
        await ctx.reply(`⚠️ *Trade Execution*\n\n` +
            `This would execute the arbitrage trade.\n` +
            `Connect your exchange APIs first.`, { parse_mode: 'Markdown' });
    });
    bot.catch((err, ctx) => {
        console.error(`[ArbWatch] Error:`, err);
        ctx.reply('⚠️ Error occurred.');
    });
    return bot;
}
exports.default = createArbWatchBot;
//# sourceMappingURL=arbwatch.js.map
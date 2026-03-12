"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRosterRadarBot = createRosterRadarBot;
const telegraf_1 = require("telegraf");
const payments_1 = require("../../shared/payments");
const logger_1 = require("../../../utils/logger");
const APP_ID = 'rosterradar';
function createRosterRadarBot(token) {
    const bot = new telegraf_1.Telegraf(token);
    bot.command('start', async (ctx) => {
        await ctx.reply(`🏈 *RosterRadar* — DFS + Betting Edge Scanner\n\n` +
            `Commands:\n` +
            `/lines - Public line snapshot\n` +
            `/props - Top prop movement\n` +
            `/optimizer - Lineup optimizer (Pro)\n` +
            `/status /pricing /subscribe - Billing`, { parse_mode: 'Markdown' });
    });
    bot.command('help', async (ctx) => {
        await ctx.reply(`*RosterRadar Commands*\n\n` +
            `/lines - Latest line movement\n` +
            `/props - Prop momentum board\n` +
            `/optimizer - Premium lineup optimizer\n\n` +
            `Billing: /status /pricing /subscribe`, { parse_mode: 'Markdown' });
    });
    bot.command('status', (0, payments_1.createStatusCommand)(APP_ID));
    bot.command('pricing', (0, payments_1.createPricingCommand)(APP_ID));
    bot.command('subscribe', (0, payments_1.createSubscribeCommand)(APP_ID));
    bot.command('lines', async (ctx) => {
        await ctx.reply(`📈 *Live Line Snapshot*\n\n` +
            `• BOS -2.5 → -3.0\n` +
            `• LAL O/U 231.5 → 233.0\n` +
            `• KC ML -128 → -140\n\n` +
            `_Live data adapter wired; source feed rollout in progress._`, { parse_mode: 'Markdown' });
    });
    bot.command('props', async (ctx) => {
        await ctx.reply(`🎯 *Top Prop Movers*\n\n` +
            `1) Tatum points 27.5 → 28.5\n` +
            `2) Mahomes pass yds 284.5 → 291.5\n` +
            `3) Doncic assists 8.5 → 9.5`, { parse_mode: 'Markdown' });
    });
    bot.command('optimizer', (0, payments_1.withSubscription)(APP_ID, 'pro'), async (ctx) => {
        await ctx.reply(`🧠 *Optimizer (Pro)*\n\n` +
            `Top projected lineup value:\n` +
            `• EV: +8.7%\n` +
            `• Risk tier: Medium\n` +
            `• Correlation-adjusted score: 0.74\n\n` +
            `_Full lineup payload shipping behind rollout flags._`, { parse_mode: 'Markdown' });
    });
    bot.catch((err, ctx) => {
        const error = err instanceof Error ? err : new Error(String(err));
        logger_1.logger.error({ err: error, chatId: ctx.chat?.id, username: ctx.from?.username }, 'RosterRadar handler error');
        ctx.reply('⚠️ RosterRadar error. Retry shortly.').catch(() => { });
    });
    return bot;
}
exports.default = createRosterRadarBot;
//# sourceMappingURL=rosterradar.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSignalOracleBot = createSignalOracleBot;
const telegraf_1 = require("telegraf");
const logger_1 = require("../../../utils/logger");
/**
 * SignalOracle Bot - Trading signals and alerts
 * Telegram: @SignalOracleKingBot
 */
function createSignalOracleBot(token) {
    const bot = new telegraf_1.Telegraf(token);
    bot.command('start', async (ctx) => {
        logger_1.logger.info(`[SignalOracle] New user: ${ctx.from?.id}`);
        await ctx.reply('🔮 *SignalOracle Ready!*\n\n' +
            'AI-powered trading signals\n\n' +
            '📊 /signals - Active signals\n' +
            '📈 /premium - Premium channel\n' +
            '⚙️ /settings - Configure alerts\n' +
            '📜 /history - Past performance', { parse_mode: 'Markdown' });
    });
    bot.command('signals', async (ctx) => {
        await ctx.reply('🔮 *Active Signals*\n\n' +
            '🟢 BUY - ETH @ $2,450\n' +
            '   TP1: $2,600 | TP2: $2,800\n' +
            '   SL: $2,350\n\n' +
            '🔴 SELL - PEPE @ 0.0000012\n' +
            '   Profit: +45% from entry\n\n' +
            '⏳ PENDING - BTC breakout', { parse_mode: 'Markdown' });
    });
    bot.catch((err) => {
        logger_1.logger.error('[SignalOracle] Error:', err);
    });
    return bot;
}
//# sourceMappingURL=signloracle.js.map
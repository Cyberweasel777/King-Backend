"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWhaleWatcherBot = createWhaleWatcherBot;
const telegraf_1 = require("telegraf");
const logger_1 = require("../../../utils/logger");
/**
 * WhaleWatcher Bot - Large wallet monitoring
 * Telegram: @WhaleWatcherKingBot
 */
function createWhaleWatcherBot(token) {
    const bot = new telegraf_1.Telegraf(token);
    bot.command('start', async (ctx) => {
        logger_1.logger.info(`[WhaleWatcher] New user: ${ctx.from?.id}`);
        await ctx.reply('🐋 *WhaleWatcher Ready!*\n\n' +
            'Track smart money movements\n\n' +
            '📊 /movements - Recent whale moves\n' +
            '🔍 /wallet <address> - Track wallet\n' +
            '➕ /watch - Add wallet to watch\n' +
            '📈 /flows - Inflow/outflow data', { parse_mode: 'Markdown' });
    });
    bot.command('movements', async (ctx) => {
        await ctx.reply('🐋 *Recent Whale Activity*\n\n' +
            '🟢 $45M ETH moved to Coinbase\n' +
            '   Wallet: 0x1234...5678\n\n' +
            '🔴 $12M USDT withdrawn from Binance\n' +
            '   Wallet: 0xabcd...ef01\n\n' +
            '🟡 $8M WBTC transferred to cold storage\n' +
            '   Wallet: 0x9876...5432', { parse_mode: 'Markdown' });
    });
    bot.catch((err) => {
        logger_1.logger.error('[WhaleWatcher] Error:', err);
    });
    return bot;
}
//# sourceMappingURL=whalewatcher.js.map
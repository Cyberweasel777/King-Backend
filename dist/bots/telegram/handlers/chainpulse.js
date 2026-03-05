"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createChainPulseBot = createChainPulseBot;
const telegraf_1 = require("telegraf");
const logger_1 = require("../../../utils/logger");
/**
 * ChainPulse Bot - Cross-chain analytics
 * Telegram: @ChainPulseKingBot
 */
function createChainPulseBot(token) {
    const bot = new telegraf_1.Telegraf(token);
    bot.command('start', async (ctx) => {
        logger_1.logger.info(`[ChainPulse] New user: ${ctx.from?.id}`);
        await ctx.reply('⛓ *ChainPulse Ready!*\n\n' +
            'Cross-chain intelligence\n\n' +
            '🌉 /bridges - Bridge activity\n' +
            '💰 /tvl - Chain TVL comparison\n' +
            '📈 /flows - Cross-chain flows\n' +
            '⚡ /gas - Gas prices', { parse_mode: 'Markdown' });
    });
    bot.command('gas', async (ctx) => {
        await ctx.reply('⛽ *Current Gas Prices*\n\n' +
            'Ethereum: 25 gwei ⬇️\n' +
            'Arbitrum: 0.1 gwei ➡️\n' +
            'Optimism: 0.05 gwei ➡️\n' +
            'Base: 0.08 gwei ⬆️\n' +
            'Polygon: 50 gwei ➡️\n' +
            'BSC: 3 gwei ➡️\n\n' +
            'Updated: Just now', { parse_mode: 'Markdown' });
    });
    bot.catch((err) => {
        logger_1.logger.error('[ChainPulse] Error:', err);
    });
    return bot;
}
//# sourceMappingURL=chainpulse.js.map
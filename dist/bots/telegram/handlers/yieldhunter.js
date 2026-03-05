"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createYieldHunterBot = createYieldHunterBot;
const telegraf_1 = require("telegraf");
const logger_1 = require("../../../utils/logger");
/**
 * YieldHunter Bot - Yield farming optimizer
 * Telegram: @YieldHunterKingBot
 */
function createYieldHunterBot(token) {
    const bot = new telegraf_1.Telegraf(token);
    bot.command('start', async (ctx) => {
        logger_1.logger.info(`[YieldHunter] New user: ${ctx.from?.id}`);
        await ctx.reply('💰 *YieldHunter Ready!*\n\n' +
            'Maximize your DeFi yields\n\n' +
            '📊 /yields - Best APY opportunities\n' +
            '🔒 /vaults - Vault strategies\n' +
            '💎 /stable - Stablecoin farms\n' +
            '⚠️ /risks - Risk assessment', { parse_mode: 'Markdown' });
    });
    bot.command('yields', async (ctx) => {
        await ctx.reply('💰 *Top Yield Opportunities*\n\n' +
            '*Stablecoins:*\n' +
            'USDC/DAI: 8.5% APY (Curve)\n' +
            'USDT: 7.2% APY (Aave)\n\n' +
            '*ETH LSTs:*\n' +
            'stETH: 4.2% APY (Lido)\n' +
            'rETH: 4.5% APY (Rocket Pool)\n\n' +
            '*Riskier:*\n' +
            'XYZ/ETH: 125% APY ⚠️', { parse_mode: 'Markdown' });
    });
    bot.catch((err) => {
        logger_1.logger.error('[YieldHunter] Error:', err);
    });
    return bot;
}
//# sourceMappingURL=yieldhunter.js.map
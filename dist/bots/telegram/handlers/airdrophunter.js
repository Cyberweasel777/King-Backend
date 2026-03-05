"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAirdropHunterBot = createAirdropHunterBot;
const telegraf_1 = require("telegraf");
const logger_1 = require("../../../utils/logger");
/**
 * AirdropHunter Bot - Airdrop farming and tracking
 * Telegram: @AirdropHunterKingBot
 */
function createAirdropHunterBot(token) {
    const bot = new telegraf_1.Telegraf(token);
    bot.command('start', async (ctx) => {
        logger_1.logger.info(`[AirdropHunter] New user: ${ctx.from?.id}`);
        await ctx.reply('💧 *AirdropHunter Ready!*\n\n' +
            'Never miss an airdrop again\n\n' +
            '📋 /drops - Active airdrops\n' +
            '✅ /track <protocol> - Track progress\n' +
            '📊 /portfolio - Your airdrop stats\n' +
            '🔔 /alerts - Notification settings', { parse_mode: 'Markdown' });
    });
    bot.command('drops', async (ctx) => {
        await ctx.reply('💧 *Active Airdrops*\n\n' +
            '🚨 CONFIRMED:\n' +
            '• LayerZero - TBA\n' +
            '• zkSync - TBA\n\n' +
            '📋 POTENTIAL:\n' +
            '• Linea - Active farming\n' +
            '• Scroll - Active farming\n' +
            '• Base - NFT campaign\n\n' +
            'Use /track <name> to monitor', { parse_mode: 'Markdown' });
    });
    bot.catch((err) => {
        logger_1.logger.error('[AirdropHunter] Error:', err);
    });
    return bot;
}
//# sourceMappingURL=airdrophunter.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createNicheHunterBot = createNicheHunterBot;
const telegraf_1 = require("telegraf");
const logger_1 = require("../../../utils/logger");
/**
 * NicheHunter Bot - Niche and micro-cap discovery
 * Telegram: @NicheHunterKingBot
 */
function createNicheHunterBot(token) {
    const bot = new telegraf_1.Telegraf(token);
    bot.command('start', async (ctx) => {
        logger_1.logger.info(`[NicheHunter] New user: ${ctx.from?.id}`);
        await ctx.reply('🎯 *NicheHunter Ready!*\n\n' +
            'Discover hidden gems early\n\n' +
            '💎 /gems - New micro-caps\n' +
            '🚀 /launchpad - Upcoming launches\n' +
            '📊 /categories - Hot sectors\n' +
            '🔍 /filter - Custom search', { parse_mode: 'Markdown' });
    });
    bot.command('gems', async (ctx) => {
        await ctx.reply('💎 *Hidden Gems*\n\n' +
            '1. $GEMX - Gaming infra\n' +
            '   MC: $450K | Vol: +200%\n\n' +
            '2. $AIDefi - AI protocol\n' +
            '   MC: $890K | Vol: +150%\n\n' +
            '3. $L2X - L2 solution\n' +
            '   MC: $1.2M | Vol: +85%\n\n' +
            '⚠️ DYOR - High risk plays', { parse_mode: 'Markdown' });
    });
    bot.catch((err) => {
        logger_1.logger.error('[NicheHunter] Error:', err);
    });
    return bot;
}
//# sourceMappingURL=nichehunter.js.map
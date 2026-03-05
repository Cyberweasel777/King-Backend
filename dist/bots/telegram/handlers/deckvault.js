"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDeckVaultBot = createDeckVaultBot;
const telegraf_1 = require("telegraf");
const logger_1 = require("../../../utils/logger");
/**
 * DeckVault Bot - Research and due diligence
 * Telegram: @DeckVaultKingBot
 */
function createDeckVaultBot(token) {
    const bot = new telegraf_1.Telegraf(token);
    bot.command('start', async (ctx) => {
        logger_1.logger.info(`[DeckVault] New user: ${ctx.from?.id}`);
        await ctx.reply('📚 *DeckVault Ready!*\n\n' +
            'Your research companion\n\n' +
            '🔍 /research <token> - Deep dive analysis\n' +
            '📊 /report - Generate PDF report\n' +
            '📈 /compare <token1> <token2> - Compare projects\n' +
            '🚨 /risk <token> - Risk assessment', { parse_mode: 'Markdown' });
    });
    bot.command('research', async (ctx) => {
        await ctx.reply('🔍 *Research Mode*\n\n' +
            'Send a token contract or symbol\n' +
            'for comprehensive analysis:\n\n' +
            '• Tokenomics overview\n' +
            '• Team verification\n' +
            '• Smart contract audit\n' +
            '• Community sentiment\n' +
            '• Market metrics', { parse_mode: 'Markdown' });
    });
    bot.catch((err) => {
        logger_1.logger.error('[DeckVault] Error:', err);
    });
    return bot;
}
//# sourceMappingURL=deckvault.js.map
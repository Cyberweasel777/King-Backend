"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createValidatorXBot = createValidatorXBot;
const telegraf_1 = require("telegraf");
const logger_1 = require("../../../utils/logger");
/**
 * ValidatorX Bot - Validator analytics and monitoring
 * Telegram: @ValidatorXKingBot
 */
function createValidatorXBot(token) {
    const bot = new telegraf_1.Telegraf(token);
    bot.command('start', async (ctx) => {
        logger_1.logger.info(`[ValidatorX] New user: ${ctx.from?.id}`);
        await ctx.reply('✅ *ValidatorX Ready!*\n\n' +
            'Validator performance analytics\n\n' +
            '📊 /validators - Top validators\n' +
            '🔍 /check <validator> - Check status\n' +
            '➕ /monitor - Add to monitoring\n' +
            '⚠️ /slashes - Recent slashings', { parse_mode: 'Markdown' });
    });
    bot.command('validators', async (ctx) => {
        await ctx.reply('✅ *Top Validators*\n\n' +
            '*Ethereum:*\n' +
            '1. Lido - 22.5% share\n' +
            '2. Coinbase - 12.3% share\n' +
            '3. Figment - 4.1% share\n\n' +
            '*Performance (24h):*\n' +
            'Attestation: 99.2% avg\n' +
            'Proposals: 100%\n\n' +
            'No slashings detected', { parse_mode: 'Markdown' });
    });
    bot.catch((err) => {
        logger_1.logger.error('[ValidatorX] Error:', err);
    });
    return bot;
}
//# sourceMappingURL=validatorx.js.map
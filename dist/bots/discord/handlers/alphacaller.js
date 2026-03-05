"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAlphaCallerBot = createAlphaCallerBot;
const discord_js_1 = require("discord.js");
const logger_1 = require("../../../utils/logger");
/**
 * AlphaCaller Bot - Alpha calls and alerts for Discord
 * Discord: Alpha Caller
 */
function createAlphaCallerBot(client) {
    // Ready event
    client.once(discord_js_1.Events.ClientReady, (readyClient) => {
        logger_1.logger.info(`[AlphaCaller] Discord bot ready as ${readyClient.user.tag}`);
    });
    // Message handler
    client.on(discord_js_1.Events.MessageCreate, async (message) => {
        if (message.author.bot)
            return;
        const prefix = '!alpha';
        if (!message.content.startsWith(prefix))
            return;
        const args = message.content.slice(prefix.length).trim().split(/\s+/);
        const command = args.shift()?.toLowerCase();
        try {
            switch (command) {
                case 'call':
                    await message.reply({
                        embeds: [{
                                title: '📢 Alpha Call',
                                description: 'Submit your alpha call with details.',
                                color: 0xFFD700,
                                fields: [
                                    { name: 'Format', value: '!alpha submit <token> <reason>', inline: false }
                                ]
                            }]
                    });
                    break;
                case 'latest':
                    await message.reply({
                        embeds: [{
                                title: '🔥 Latest Alpha Calls',
                                description: 'Recent high-confidence calls from the community.',
                                color: 0x00FF00,
                                fields: [
                                    { name: '$KING', value: 'Breakout pattern forming 📈', inline: true },
                                    { name: '$PEPE', value: 'Whale accumulation spotted 🐋', inline: true }
                                ]
                            }]
                    });
                    break;
                default:
                    await message.reply('📢 AlphaCaller commands: `call`, `latest`, `submit`');
            }
        }
        catch (error) {
            logger_1.logger.error('[AlphaCaller] Command error:', error);
        }
    });
    return client;
}
//# sourceMappingURL=alphacaller.js.map
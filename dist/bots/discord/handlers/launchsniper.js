"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLaunchSniperBot = createLaunchSniperBot;
const discord_js_1 = require("discord.js");
const logger_1 = require("../../../utils/logger");
/**
 * LaunchSniper Bot - New launch detection and sniping alerts
 * Discord: Launch Sniper
 */
function createLaunchSniperBot(client) {
    client.once(discord_js_1.Events.ClientReady, (readyClient) => {
        logger_1.logger.info(`[LaunchSniper] Discord bot ready as ${readyClient.user.tag}`);
    });
    client.on(discord_js_1.Events.MessageCreate, async (message) => {
        if (message.author.bot)
            return;
        const prefix = '!launch';
        if (!message.content.startsWith(prefix))
            return;
        const args = message.content.slice(prefix.length).trim().split(/\s+/);
        const command = args.shift()?.toLowerCase();
        try {
            switch (command) {
                case 'upcoming':
                    await message.reply({
                        embeds: [{
                                title: '🚀 Upcoming Launches',
                                description: 'Token launches and IDOs to watch',
                                color: 0xFF6B6B,
                                fields: [
                                    { name: 'Today', value: '• Project X on Uniswap (2 PM UTC)\n• GameFi Y on PancakeSwap (6 PM UTC)', inline: false },
                                    { name: 'Tomorrow', value: '• DeFi Z IDO on DAOMaker', inline: false }
                                ]
                            }]
                    });
                    break;
                case 'snipe':
                    await message.reply('🎯 Sniping bot configured. Watch channels for auto-alerts!');
                    break;
                default:
                    await message.reply('🚀 LaunchSniper commands: `upcoming`, `snipe`, `settings`');
            }
        }
        catch (error) {
            logger_1.logger.error('[LaunchSniper] Command error:', error);
        }
    });
    return client;
}
//# sourceMappingURL=launchsniper.js.map
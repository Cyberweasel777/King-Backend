import { Client, Events } from 'discord.js';
import { logger } from '../../../utils/logger';

/**
 * LaunchSniper Bot - New launch detection and sniping alerts
 * Discord: Launch Sniper
 */

export function createLaunchSniperBot(client: Client): Client {
  client.once(Events.ClientReady, (readyClient) => {
    logger.info(`[LaunchSniper] Discord bot ready as ${readyClient.user.tag}`);
  });

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;

    const prefix = '!launch';
    if (!message.content.startsWith(prefix)) return;

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
    } catch (error) {
      logger.error('[LaunchSniper] Command error:', error);
    }
  });

  return client;
}

import { Client, Events } from 'discord.js';
import { logger } from '../../../utils/logger';

/**
 * DAOGrinder Bot - DAO governance and proposal tracking
 * Discord: DAO Grinder
 */

export function createDAOGrinderBot(client: Client): Client {
  client.once(Events.ClientReady, (readyClient) => {
    logger.info(`[DAOGrinder] Discord bot ready as ${readyClient.user.tag}`);
  });

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;

    const prefix = '!dao';
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/\s+/);
    const command = args.shift()?.toLowerCase();

    try {
      switch (command) {
        case 'proposals':
          await message.reply({
            embeds: [{
              title: '🏛 Active Proposals',
              description: 'Current DAO governance proposals',
              color: 0x8B4513,
              fields: [
                { name: 'Uniswap #42', value: 'Fee tier adjustment - 2 days left', inline: false },
                { name: 'Aave #128', value: 'New collateral onboarding - 5 days left', inline: false }
              ]
            }]
          });
          break;

        case 'vote':
          await message.reply('🗳️ Voting portal: https://king.vote (placeholder)');
          break;

        default:
          await message.reply('🏛 DAOGrinder commands: `proposals`, `vote`, `delegate`');
      }
    } catch (error) {
      logger.error('[DAOGrinder] Command error:', error);
    }
  });

  return client;
}

import { Telegraf } from 'telegraf';
import { logger } from '../../../utils/logger';

/**
 * AirdropHunter Bot - Airdrop farming and tracking
 * Telegram: @AirdropHunterKingBot
 */

export function createAirdropHunterBot(token: string): Telegraf {
  const bot = new Telegraf(token);

  bot.command('start', async (ctx) => {
    logger.info(`[AirdropHunter] New user: ${ctx.from?.id}`);
    await ctx.reply(
      '💧 *AirdropHunter Ready!*\n\n' +
      'Never miss an airdrop again\n\n' +
      '📋 /drops - Active airdrops\n' +
      '✅ /track <protocol> - Track progress\n' +
      '📊 /portfolio - Your airdrop stats\n' +
      '🔔 /alerts - Notification settings',
      { parse_mode: 'Markdown' }
    );
  });

  bot.command('drops', async (ctx) => {
    await ctx.reply(
      '💧 *Active Airdrops*\n\n' +
      '🚨 CONFIRMED:\n' +
      '• LayerZero - TBA\n' +
      '• zkSync - TBA\n\n' +
      '📋 POTENTIAL:\n' +
      '• Linea - Active farming\n' +
      '• Scroll - Active farming\n' +
      '• Base - NFT campaign\n\n' +
      'Use /track <name> to monitor',
      { parse_mode: 'Markdown' }
    );
  });

  bot.catch((err: unknown) => {
    logger.error('[AirdropHunter] Error:', err);
  });

  return bot;
}

import { Telegraf } from 'telegraf';
import { logger } from '../../../utils/logger';

/**
 * NicheHunter Bot - Niche and micro-cap discovery
 * Telegram: @NicheHunterKingBot
 */

export function createNicheHunterBot(token: string): Telegraf {
  const bot = new Telegraf(token);

  bot.command('start', async (ctx) => {
    logger.info(`[NicheHunter] New user: ${ctx.from?.id}`);
    await ctx.reply(
      '🎯 *NicheHunter Ready!*\n\n' +
      'Discover hidden gems early\n\n' +
      '💎 /gems - New micro-caps\n' +
      '🚀 /launchpad - Upcoming launches\n' +
      '📊 /categories - Hot sectors\n' +
      '🔍 /filter - Custom search',
      { parse_mode: 'Markdown' }
    );
  });

  bot.command('gems', async (ctx) => {
    await ctx.reply(
      '💎 *Hidden Gems*\n\n' +
      '1. $GEMX - Gaming infra\n' +
      '   MC: $450K | Vol: +200%\n\n' +
      '2. $AIDefi - AI protocol\n' +
      '   MC: $890K | Vol: +150%\n\n' +
      '3. $L2X - L2 solution\n' +
      '   MC: $1.2M | Vol: +85%\n\n' +
      '⚠️ DYOR - High risk plays',
      { parse_mode: 'Markdown' }
    );
  });

  bot.catch((err: unknown) => {
    logger.error('[NicheHunter] Error:', err);
  });

  return bot;
}

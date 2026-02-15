import { Telegraf } from 'telegraf';
import { logger } from '../../../utils/logger';

/**
 * DeckVault Bot - Research and due diligence
 * Telegram: @DeckVaultKingBot
 */

export function createDeckVaultBot(token: string): Telegraf {
  const bot = new Telegraf(token);

  bot.command('start', async (ctx) => {
    logger.info(`[DeckVault] New user: ${ctx.from?.id}`);
    await ctx.reply(
      '📚 *DeckVault Ready!*\n\n' +
      'Your research companion\n\n' +
      '🔍 /research <token> - Deep dive analysis\n' +
      '📊 /report - Generate PDF report\n' +
      '📈 /compare <token1> <token2> - Compare projects\n' +
      '🚨 /risk <token> - Risk assessment',
      { parse_mode: 'Markdown' }
    );
  });

  bot.command('research', async (ctx) => {
    await ctx.reply(
      '🔍 *Research Mode*\n\n' +
      'Send a token contract or symbol\n' +
      'for comprehensive analysis:\n\n' +
      '• Tokenomics overview\n' +
      '• Team verification\n' +
      '• Smart contract audit\n' +
      '• Community sentiment\n' +
      '• Market metrics',
      { parse_mode: 'Markdown' }
    );
  });

  bot.catch((err: unknown) => {
    logger.error('[DeckVault] Error:', err);
  });

  return bot;
}

import { Telegraf } from 'telegraf';
import { logger } from '../../../utils/logger';

/**
 * SignalOracle Bot - Trading signals and alerts
 * Telegram: @SignalOracleKingBot
 */

export function createSignalOracleBot(token: string): Telegraf {
  const bot = new Telegraf(token);

  bot.command('start', async (ctx) => {
    logger.info(`[SignalOracle] New user: ${ctx.from?.id}`);
    await ctx.reply(
      '🔮 *SignalOracle Ready!*\n\n' +
      'AI-powered trading signals\n\n' +
      '📊 /signals - Active signals\n' +
      '📈 /premium - Premium channel\n' +
      '⚙️ /settings - Configure alerts\n' +
      '📜 /history - Past performance',
      { parse_mode: 'Markdown' }
    );
  });

  bot.command('signals', async (ctx) => {
    await ctx.reply(
      '🔮 *Active Signals*\n\n' +
      '🟢 BUY - ETH @ $2,450\n' +
      '   TP1: $2,600 | TP2: $2,800\n' +
      '   SL: $2,350\n\n' +
      '🔴 SELL - PEPE @ 0.0000012\n' +
      '   Profit: +45% from entry\n\n' +
      '⏳ PENDING - BTC breakout',
      { parse_mode: 'Markdown' }
    );
  });

  bot.catch((err: unknown) => {
    logger.error('[SignalOracle] Error:', err);
  });

  return bot;
}

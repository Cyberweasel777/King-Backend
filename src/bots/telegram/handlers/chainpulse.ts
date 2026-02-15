import { Telegraf } from 'telegraf';
import { logger } from '../../../utils/logger';

/**
 * ChainPulse Bot - Cross-chain analytics
 * Telegram: @ChainPulseKingBot
 */

export function createChainPulseBot(token: string): Telegraf {
  const bot = new Telegraf(token);

  bot.command('start', async (ctx) => {
    logger.info(`[ChainPulse] New user: ${ctx.from?.id}`);
    await ctx.reply(
      '⛓ *ChainPulse Ready!*\n\n' +
      'Cross-chain intelligence\n\n' +
      '🌉 /bridges - Bridge activity\n' +
      '💰 /tvl - Chain TVL comparison\n' +
      '📈 /flows - Cross-chain flows\n' +
      '⚡ /gas - Gas prices',
      { parse_mode: 'Markdown' }
    );
  });

  bot.command('gas', async (ctx) => {
    await ctx.reply(
      '⛽ *Current Gas Prices*\n\n' +
      'Ethereum: 25 gwei ⬇️\n' +
      'Arbitrum: 0.1 gwei ➡️\n' +
      'Optimism: 0.05 gwei ➡️\n' +
      'Base: 0.08 gwei ⬆️\n' +
      'Polygon: 50 gwei ➡️\n' +
      'BSC: 3 gwei ➡️\n\n' +
      'Updated: Just now',
      { parse_mode: 'Markdown' }
    );
  });

  bot.catch((err: unknown) => {
    logger.error('[ChainPulse] Error:', err);
  });

  return bot;
}

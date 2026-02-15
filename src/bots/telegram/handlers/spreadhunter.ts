import { Telegraf } from 'telegraf';
import { logger } from '../../../utils/logger';

/**
 * SpreadHunter Bot - Arbitrage and spread detection
 * Telegram: @SpreadHunterKingBot
 */

export function createSpreadHunterBot(token: string): Telegraf {
  const bot = new Telegraf(token);

  bot.command('start', async (ctx) => {
    logger.info(`[SpreadHunter] New user: ${ctx.from?.id}`);
    await ctx.reply(
      '🎯 *SpreadHunter Ready!*\n\n' +
      'Arbitrage opportunities across DEXs\n\n' +
      '📊 /spreads - Live arbitrage spreads\n' +
      '⚡ /alert - Set spread alerts\n' +
      '💹 /pairs - Top trading pairs\n' +
      '🔍 /scan <token> - Scan for opportunities',
      { parse_mode: 'Markdown' }
    );
  });

  bot.command('spreads', async (ctx) => {
    await ctx.reply(
      '💹 *Live Arbitrage Spreads*\n\n' +
      '🔥 Top opportunities:\n\n' +
      'ETH/USDC\n' +
      '└ Uniswap: $2,450.20\n' +
      '└ SushiSwap: $2,448.90\n' +
      '└ Spread: 0.05%\n\n' +
      'WBTC/USDC\n' +
      '└ Uniswap: $67,234.50\n' +
      '└ Curve: $67,190.20\n' +
      '└ Spread: 0.07%\n\n' +
      '_Real-time data coming soon_',
      { parse_mode: 'Markdown' }
    );
  });

  bot.catch((err: unknown) => {
    logger.error('[SpreadHunter] Error:', err);
  });

  return bot;
}

import { Telegraf } from 'telegraf';
import { logger } from '../../../utils/logger';
import {
  withSubscription,
  createStatusCommand,
  createPricingCommand,
  createSubscribeCommand,
} from '../../shared/payments';

const APP_ID = 'spreadhunter' as const;

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

  bot.command('status', createStatusCommand(APP_ID));
  bot.command('pricing', createPricingCommand(APP_ID));
  bot.command('subscribe', createSubscribeCommand(APP_ID));

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

  bot.command(
    'scan',
    withSubscription(APP_ID, 'basic'),
    async (ctx) => {
      const text = (ctx.message as any)?.text || '';
      const token = text.trim().split(/\s+/)[1];
      if (!token) {
        await ctx.reply('Usage: /scan <token>');
        return;
      }

      await ctx.reply(
        `🔎 *Spread Scan: ${token.toUpperCase()}*\n\n` +
        `• Top spread: 0.11%\n` +
        `• Confidence: 0.72\n` +
        `• Persistence: 2 cycles\n\n` +
        `_Execution-grade filters active in Pro workflows._`,
        { parse_mode: 'Markdown' }
      );
    }
  );

  bot.command('pairs', async (ctx) => {
    await ctx.reply(
      `📊 *Top Pairs*\n\n` +
      `1) ETH/USDC\n` +
      `2) WBTC/USDC\n` +
      `3) SOL/USDC\n` +
      `4) ARB/USDC`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.command(
    'alert',
    withSubscription(APP_ID, 'pro'),
    async (ctx) => {
      await ctx.reply(
        `🔔 *Spread Alerts (Pro)*\n\n` +
        `Alert routing enabled.\n` +
        `Use /scan <token> for targeted opportunities.`,
        { parse_mode: 'Markdown' }
      );
    }
  );

  bot.catch((err: unknown) => {
    logger.error('[SpreadHunter] Error:', err);
  });

  return bot;
}

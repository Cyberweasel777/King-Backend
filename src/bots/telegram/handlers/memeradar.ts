/**
 * MemeRadar Telegram Bot Handler
 * 
 * TODO: Paste your working MemeRadar bot code here
 */

import { Telegraf, Context } from 'telegraf';
import { 
  withSubscription, 
  createStatusCommand, 
  createPricingCommand, 
  createSubscribeCommand 
} from '../../shared/payments';

const APP_ID = 'memeradar' as const;

export function createMemeRadarBot(token: string) {
  const bot = new Telegraf(token);

  bot.command('start', async (ctx) => {
    await ctx.reply(
      `🐸 *MemeRadar* — Memecoin Discovery\n\n` +
      `Track trending memes and whale moves.`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(
      `*MemeRadar Commands*\n\n` +
      `Free:\n` +
      `/trending — Trending memes\n` +
      `/token <name> — Token info\n` +
      `/status — Your subscription\n\n` +
      `Pro:\n` +
      `/whales — Whale activity`
    );
  });

  // Payment commands
  bot.command('status', createStatusCommand(APP_ID));
  bot.command('pricing', createPricingCommand(APP_ID));
  bot.command('subscribe', createSubscribeCommand(APP_ID));

  // Free: Trending (with limits)
  bot.command('trending', async (ctx) => {
    // TODO: Paste your working trending command
    await ctx.reply(
      `🔥 *Trending Memes*\n\n` +
      `1. PEPE — +45% (Vol: $10M)\n` +
      `2. WOJAK — +32% (Vol: $5M)\n\n` +
      `_Free tier: 5 tokens max_`,
      { parse_mode: 'Markdown' }
    );
  });

  // Free: Token info
  bot.command('token', async (ctx) => {
    // TODO: Paste your working token command
    const token = ctx.message.text.split(' ')[1];
    if (!token) {
      return ctx.reply('Usage: /token <token-name>');
    }
    await ctx.reply(
      `📊 *${token.toUpperCase()}*\n\n` +
      `Price: $0.001 (+15%)\n` +
      `Volume: $1M\n` +
      `Holders: 5,000`,
      { parse_mode: 'Markdown' }
    );
  });

  // Pro: Whale activity (gated)
  bot.command('whales', 
    withSubscription(APP_ID, 'pro'),
    async (ctx) => {
      // TODO: Paste your working whale command
      await ctx.reply(
        `🐋 *Whale Activity*\n\n` +
        `• PEPE: Buy $50k (0x1234...)\n` +
        `• DOGE: Sell $100k (0x5678...)`,
        { parse_mode: 'Markdown' }
      );
    }
  );

  bot.catch((err: any, ctx: Context) => {
    console.error(`[MemeRadar] Error:`, err);
    ctx.reply('⚠️ Error occurred.');
  });

  return bot;
}

export default createMemeRadarBot;

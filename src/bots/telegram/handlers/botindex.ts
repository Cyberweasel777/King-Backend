import { Telegraf, Context } from 'telegraf';
import {
  withSubscription,
  createStatusCommand,
  createPricingCommand,
  createSubscribeCommand
} from '../../shared/payments';
import { logger } from '../../../utils/logger';

const APP_ID = 'botindex' as const;
const API_BASE = process.env.API_BASE_URL || 'http://localhost:8080';

const commandRateWindowMs = 60_000;
const commandRateLimit = 12;
const commandUsage = new Map<string, { count: number; resetAt: number }>();

function escapeMd(input: string): string {
  return input.replace(/([_\*\[\]\(\)~`>#+\-=|{}.!])/g, '\\$1');
}

function allowCommand(ctx: Context): boolean {
  const userId = ctx.from?.id?.toString();
  if (!userId) return true;

  const now = Date.now();
  const row = commandUsage.get(userId);
  if (!row || now > row.resetAt) {
    commandUsage.set(userId, { count: 1, resetAt: now + commandRateWindowMs });
    return true;
  }

  if (row.count >= commandRateLimit) return false;
  row.count += 1;
  return true;
}

async function apiGet(path: string): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export function createBotIndexBot(token: string) {
  const bot = new Telegraf(token);

  bot.command('start', async (ctx) => {
    await ctx.reply(
      `🤖 *BotIndex* — Bot Signal Correlation\n\n` +
      `Commands:\n` +
      `/signals — Latest bot signals (free)\n` +
      `/correlation <tokenA> <tokenB> — Pair correlation (free limited)\n` +
      `/leaders — Market leaders (Pro)\n` +
      `/pricing — View plans\n` +
      `/status — Your subscription`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(
      `*BotIndex Commands*\n\n` +
      `/signals — Top correlated signal pairs\n` +
      `/correlation <tokenA> <tokenB> — Pair correlation\n` +
      `/leaders — Lead/lag leaders (Pro)\n` +
      `/status /pricing /subscribe — Billing`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.command('status', createStatusCommand(APP_ID));
  bot.command('pricing', createPricingCommand(APP_ID));
  bot.command('subscribe', createSubscribeCommand(APP_ID));

  bot.command('signals', async (ctx) => {
    if (!allowCommand(ctx)) {
      await ctx.reply('⏱️ Rate limit hit. Wait a minute and try again.');
      return;
    }

    try {
      const data = await apiGet('/api/botindex/signals?limit=5');
      const signals = (data.signals || []) as Array<any>;

      if (!signals.length) {
        await ctx.reply('No signals available right now.');
        return;
      }

      const lines = signals.map((s, i) => {
        const emoji = s.signal === 'buy' ? '🟢' : s.signal === 'sell' ? '🔴' : '⚪';
        return `${i + 1}. ${emoji} *${escapeMd(String(s.token || 'UNKNOWN'))}* — ${escapeMd(String(s.signal || 'hold').toUpperCase())} ` +
          `(${Math.round((s.confidence || 0) * 100)}%)`;
      });

      await ctx.reply(
        `📊 *BotIndex Signals*\n\n${lines.join('\n')}`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      logger.error({ err, ctx: { chatId: ctx.chat?.id, username: ctx.from?.username } }, 'Signals error');
      await ctx.reply('⚠️ Failed to fetch signals. Try again shortly.');
    }
  });

  bot.command('correlation', async (ctx) => {
    if (!allowCommand(ctx)) {
      await ctx.reply('⏱️ Rate limit hit. Wait a minute and try again.');
      return;
    }

    const text = (ctx.message as any)?.text || '';
    const [, tokenA, tokenB] = text.trim().split(/\s+/);

    if (!tokenA || !tokenB) {
      await ctx.reply('Usage: /correlation <tokenA> <tokenB>\nExample: /correlation BONK WIF');
      return;
    }

    try {
      const path = `/api/botindex/correlation/${encodeURIComponent(tokenA)}/${encodeURIComponent(tokenB)}?window=24h`;
      const data = await apiGet(path);
      await ctx.reply(
        `🎯 *Pair Correlation*\n` +
        `${escapeMd(tokenA)} ↔ ${escapeMd(tokenB)}\n` +
        `Coefficient: *${Number(data.correlation || 0).toFixed(3)}*\n` +
        `Relationship: *${escapeMd(String(data.relationship || 'unknown'))}*\n` +
        `Sample size: ${Number(data.sampleSize || 0)}`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      logger.error({ err, ctx: { chatId: ctx.chat?.id, username: ctx.from?.username } }, 'Correlation error');
      await ctx.reply('⚠️ Correlation lookup failed. Check token ids and retry.');
    }
  });

  bot.command('leaders',
    withSubscription(APP_ID, 'pro'),
    async (ctx) => {
      if (!allowCommand(ctx)) {
        await ctx.reply('⏱️ Rate limit hit. Wait a minute and try again.');
        return;
      }

      try {
        const data = await apiGet('/api/botindex/correlation/leaders?window=24h&limit=5');
        const leaders = (data.leaders || []) as Array<any>;

        if (!leaders.length) {
          await ctx.reply('No leadership signals available right now.');
          return;
        }

        const lines = leaders.map((l, i) =>
          `${i + 1}. *${escapeMd(String(l.token || 'UNKNOWN'))}* — lead score ${Number(l.leadScore || 0).toFixed(1)} ` +
          `| led ${Number(l.numLedTokens || 0)} tokens`
        );

        await ctx.reply(
          `🧠 *Market Leaders (24h)*\n\n${lines.join('\n')}`,
          { parse_mode: 'Markdown' }
        );
      } catch (err) {
        logger.error({ err, ctx: { chatId: ctx.chat?.id, username: ctx.from?.username } }, 'Leaders error');
        await ctx.reply('⚠️ Failed to fetch leaders. Try again shortly.');
      }
    }
  );

  bot.catch((err: unknown, ctx: Context) => {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error({ err: error, chatId: ctx.chat?.id, username: ctx.from?.username }, 'Bot handler error');
    ctx.reply('⚠️ BotIndex error. Retry in a minute.');
  });

  return bot;
}

export default createBotIndexBot;

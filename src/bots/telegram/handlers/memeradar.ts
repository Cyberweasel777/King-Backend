import { Telegraf, Context } from 'telegraf';
import {
  withSubscription,
  createStatusCommand,
  createPricingCommand,
  createSubscribeCommand
} from '../../shared/payments';
import {
  getTokenReport,
  getTrending,
  getWhales,
  evaluateTokenAlerts,
} from '../../../services/memeradar';
import { buildDailyDigest } from '../../../services/memeradar/alerts';

const APP_ID = 'memeradar' as const;

type ChatId = number;

const alertSubscribers = new Set<ChatId>();
const scoreHistory = new Map<string, number>();
let alertsLoopStarted = false;

const commandRateWindowMs = 60_000;
const commandRateLimit = 12;
const commandUsage = new Map<string, { count: number; resetAt: number }>();

const alertCooldownMs = 60 * 60 * 1000;
const alertLastSentAt = new Map<string, number>();
const maxAlertMessagesPerPoll = 5;

function extractArg(text: string | undefined): string {
  if (!text) return '';
  const [, ...rest] = text.trim().split(/\s+/);
  return rest.join(' ').trim();
}

function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}...${address.slice(-4)}` : address;
}

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

async function pollAndPushAlerts(bot: Telegraf): Promise<void> {
  const trending = await getTrending({ limit: 20, chain: 'solana' });
  let sent = 0;

  for (const row of trending) {
    if (sent >= maxAlertMessagesPerPoll) break;

    const telemetry = {
      token: row.token,
      // limited data coverage in v1; keep only reliable signal active by default
      hasPaidBoost: (row.boostCount || 0) > 0,
      holderDispersionScore: row.token.holders > 3000 ? 60 : 25,
    };
    const alerts = evaluateTokenAlerts(telemetry);
    if (!alerts.length) continue;

    const freshAlerts = alerts.filter((a) => {
      const key = `${row.token.address}:${a.type}`;
      const last = alertLastSentAt.get(key) || 0;
      if (Date.now() - last < alertCooldownMs) return false;
      alertLastSentAt.set(key, Date.now());
      return true;
    });

    if (!freshAlerts.length) continue;

    const reportLines = freshAlerts
      .slice(0, 2)
      .map((a) => `• *${a.type}*: ${escapeMd(a.reason)}`)
      .join('\n');

    const msg =
      `🚨 *MemeRadar Alert*\n` +
      `Token: *${escapeMd(row.token.symbol)}* (${shortAddress(row.token.address)})\n` +
      `${reportLines}`;

    for (const chatId of alertSubscribers) {
      try {
        await bot.telegram.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
      } catch (err) {
        console.error('[MemeRadar] Failed to push alert', err);
      }
    }

    sent += 1;
  }
}

async function pushDailyDigest(bot: Telegraf): Promise<void> {
  const trending = await getTrending({ limit: 10, chain: 'solana' });
  const digest = buildDailyDigest(trending, scoreHistory).slice(0, 5);

  for (const d of digest) {
    scoreHistory.set(d.address, d.score);
  }

  const lines = digest.map((d, i) => {
    const delta = d.scoreDelta === 0 ? '±0' : d.scoreDelta > 0 ? `+${d.scoreDelta}` : `${d.scoreDelta}`;
    const flags = d.newAlerts.length ? ` | alerts: ${d.newAlerts.length}` : '';
    return `${i + 1}. *${d.symbol}* — score ${d.score} (${delta})${flags}`;
  });

  const msg =
    `🗞️ *MemeRadar Daily Risk Digest*\n` +
    `${lines.length ? lines.join('\n') : 'No high-signal changes in last cycle.'}`;

  for (const chatId of alertSubscribers) {
    try {
      await bot.telegram.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
    } catch (err) {
      console.error('[MemeRadar] Failed to push digest', err);
    }
  }
}

function startBackgroundLoops(bot: Telegraf): void {
  if (alertsLoopStarted) return;
  alertsLoopStarted = true;

  // Real-time-ish polling loop for high-impact alerts
  setInterval(() => {
    if (!alertSubscribers.size) return;
    pollAndPushAlerts(bot).catch((err) => console.error('[MemeRadar] alert loop error', err));
  }, 5 * 60 * 1000);

  // Daily digest at ~09:00 ET equivalent on host clock (every 24h from startup for v1)
  setInterval(() => {
    if (!alertSubscribers.size) return;
    pushDailyDigest(bot).catch((err) => console.error('[MemeRadar] digest loop error', err));
  }, 24 * 60 * 60 * 1000);
}

export function createMemeRadarBot(token: string) {
  const bot = new Telegraf(token);

  bot.command('start', async (ctx) => {
    await ctx.reply(
      `🐸 *MemeRadar* — Provenance Intelligence for memecoins\n\n` +
      `Use /token <address|ticker>, /trending, /whales <wallet>.\n` +
      `Enable push alerts with /alerts_on.` ,
      { parse_mode: 'Markdown' }
    );
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(
      `*MemeRadar Commands*\n\n` +
      `/token <address|ticker> — Provenance score + risk factors\n` +
      `/trending — Top movers with risk overlay\n` +
      `/whales <wallet> — Whale flow + concentration warnings\n` +
      `/alerts_on — Enable push alerts + daily digest\n` +
      `/alerts_off — Disable push alerts\n\n` +
      `Billing: /status /pricing /subscribe`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.command('status', createStatusCommand(APP_ID));
  bot.command('pricing', createPricingCommand(APP_ID));
  bot.command('subscribe', createSubscribeCommand(APP_ID));

  bot.command('alerts_on', async (ctx) => {
    alertSubscribers.add(ctx.chat.id);
    await ctx.reply('✅ Alerts enabled. You will receive trigger alerts and a daily digest.');
  });

  bot.command('alerts_off', async (ctx) => {
    alertSubscribers.delete(ctx.chat.id);
    await ctx.reply('🛑 Alerts disabled for this chat.');
  });

  bot.command('trending', async (ctx) => {
    if (!allowCommand(ctx)) {
      await ctx.reply('⏱️ Rate limit hit. Wait a minute and try again.');
      return;
    }

    const trending = await getTrending({ limit: 8, chain: 'solana' });

    if (!trending.length) {
      await ctx.reply('No trending tokens returned right now. Try again shortly.');
      return;
    }

    const lines: string[] = [];
    for (const t of trending.slice(0, 8)) {
      const report = (await getTokenReport(t.token.address, 'solana'))?.provenance;
      const score = report?.score ?? 0;
      const risk = score >= 70 ? '🟢' : score >= 50 ? '🟡' : '🔴';
      lines.push(
        `${t.rank}. ${risk} *${t.token.symbol}* ` +
        `(${t.token.priceChange24h.toFixed(1)}% 24h) | score ${score}`
      );
    }

    await ctx.reply(
      `🔥 *Trending Memes + Risk Overlay*\n\n${lines.join('\n')}`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.command('token', async (ctx) => {
    if (!allowCommand(ctx)) {
      await ctx.reply('⏱️ Rate limit hit. Wait a minute and try again.');
      return;
    }

    const identifier = extractArg((ctx.message as any)?.text).slice(0, 120);
    if (!identifier) {
      await ctx.reply('Usage: /token <address|ticker>');
      return;
    }

    const report = await getTokenReport(identifier, 'solana');
    if (!report) {
      await ctx.reply('Token not found. Try exact ticker or contract address.');
      return;
    }

    const { token, provenance } = report;
    const risk = provenance.score >= 70 ? 'LOW' : provenance.score >= 50 ? 'MEDIUM' : 'HIGH';
    const topFactors = provenance.topRiskFactors
      .map((f) => `• ${f.name}: ${f.score}/100`)
      .join('\n');
    const why = provenance.whyFlagged.length ? provenance.whyFlagged.map((w) => `• ${w}`).join('\n') : '• No critical flags from current data.';

    await ctx.reply(
      `📊 *${escapeMd(token.symbol)}* (${shortAddress(token.address)})\n` +
      `Provenance: *${provenance.score}/100*\n` +
      `Confidence: *${provenance.confidence}%*\n` +
      `Risk: *${risk}*\n\n` +
      `Top risk factors:\n${topFactors}\n\n` +
      `Why flagged:\n${why}\n\n` +
      `Price: $${token.priceUsd.toFixed(8)} | 24h: ${token.priceChange24h.toFixed(2)}%\n` +
      `Liquidity: $${Math.round(token.liquidityUsd).toLocaleString()} | Vol24h: $${Math.round(token.volume24h).toLocaleString()}`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.command('whales',
    withSubscription(APP_ID, 'pro'),
    async (ctx) => {
      if (!allowCommand(ctx)) {
        await ctx.reply('⏱️ Rate limit hit. Wait a minute and try again.');
        return;
      }

      const wallet = extractArg((ctx.message as any)?.text);
      if (!wallet) {
        await ctx.reply('Usage: /whales <solana_wallet>');
        return;
      }

      const whales = await getWhales({ wallet, limit: 8 });
      if (!whales.length) {
        await ctx.reply('No whale transfers found for that wallet in the latest window.');
        return;
      }

      const buys = whales.filter((w) => w.type === 'buy').length;
      const sells = whales.filter((w) => w.type === 'sell').length;
      const concentrationWarning = whales.length >= 6 && buys / Math.max(1, whales.length) > 0.8
        ? '⚠️ flow concentration: mostly one-directional buys'
        : whales.length >= 6 && sells / Math.max(1, whales.length) > 0.8
          ? '⚠️ flow concentration: mostly one-directional sells'
          : 'flow mixed';

      const lines = whales.slice(0, 6).map((w) =>
        `• ${w.type.toUpperCase()} ${w.tokenOut} (${new Date(w.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })})`
      );

      await ctx.reply(
        `🐋 *Whale Activity*\n` +
        `Wallet: ${shortAddress(wallet)}\n` +
        `Buys: ${buys} | Sells: ${sells} | ${concentrationWarning}\n\n` +
        `${lines.join('\n')}`,
        { parse_mode: 'Markdown' }
      );
    }
  );

  startBackgroundLoops(bot);

  bot.catch((err: any, ctx: Context) => {
    console.error(`[MemeRadar] Error:`, err);
    ctx.reply('⚠️ MemeRadar encountered an error. Retry in a minute.');
  });

  return bot;
}

export default createMemeRadarBot;

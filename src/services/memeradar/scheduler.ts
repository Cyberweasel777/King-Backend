import { Telegraf } from 'telegraf';
import { getTrending } from './index';
import { evaluateAlerts, buildDailyDigest, type AlertTelemetry } from './alerts';
import { escapeMd, shortAddress } from '../../bots/telegram/shared/middleware';

// Re-export for handler use
export type ChatId = number;

export class MemeRadarScheduler {
  private bot: Telegraf;
  private subscribers = new Set<ChatId>();
  private scoreHistory = new Map<string, number>();
  private started = false;
  private alertCooldownMs = 60 * 60 * 1000;
  private alertLastSentAt = new Map<string, number>();
  private maxAlertMessagesPerPoll = 5;
  private pollIntervalId?: ReturnType<typeof setInterval>;
  private digestIntervalId?: ReturnType<typeof setInterval>;

  constructor(bot: Telegraf) {
    this.bot = bot;
  }

  subscribe(chatId: ChatId): void {
    this.subscribers.add(chatId);
  }

  unsubscribe(chatId: ChatId): void {
    this.subscribers.delete(chatId);
  }

  start(): void {
    if (this.started) return;
    this.started = true;

    this.pollIntervalId = setInterval(() => {
      if (!this.subscribers.size) return;
      this.pollAndPushAlerts().catch(err => console.error('[MemeRadar] alert loop error', err));
    }, 5 * 60 * 1000);

    this.digestIntervalId = setInterval(() => {
      if (!this.subscribers.size) return;
      this.pushDailyDigest().catch(err => console.error('[MemeRadar] digest loop error', err));
    }, 24 * 60 * 60 * 1000);
  }

  stop(): void {
    if (this.pollIntervalId) clearInterval(this.pollIntervalId);
    if (this.digestIntervalId) clearInterval(this.digestIntervalId);
    this.started = false;
  }

  private async pollAndPushAlerts(): Promise<void> {
    const trending = await getTrending({ limit: 20, chain: 'solana' });
    let sent = 0;

    for (const row of trending) {
      if (sent >= this.maxAlertMessagesPerPoll) break;

      const telemetry: AlertTelemetry = {
        token: row.token,
        // limited data coverage in v1; keep only reliable signal active by default
        hasPaidBoost: (row.boostCount || 0) > 0,
        holderDispersionScore: row.token.holders > 3000 ? 60 : 25,
      };
      const alerts = evaluateAlerts(telemetry);
      if (!alerts.length) continue;

      const freshAlerts = alerts.filter((a) => {
        const key = `${row.token.address}:${a.type}`;
        const last = this.alertLastSentAt.get(key) || 0;
        if (Date.now() - last < this.alertCooldownMs) return false;
        this.alertLastSentAt.set(key, Date.now());
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

      for (const chatId of this.subscribers) {
        try {
          await this.bot.telegram.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
        } catch (err) {
          console.error('[MemeRadar] Failed to push alert', err);
        }
      }

      sent += 1;
    }
  }

  private async pushDailyDigest(): Promise<void> {
    const trending = await getTrending({ limit: 10, chain: 'solana' });
    const digest = buildDailyDigest(trending, this.scoreHistory).slice(0, 5);

    for (const d of digest) {
      this.scoreHistory.set(d.address, d.score);
    }

    const lines = digest.map((d, i) => {
      const delta = d.scoreDelta === 0 ? '±0' : d.scoreDelta > 0 ? `+${d.scoreDelta}` : `${d.scoreDelta}`;
      const flags = d.newAlerts.length ? ` | alerts: ${d.newAlerts.length}` : '';
      return `${i + 1}. *${d.symbol}* — score ${d.score} (${delta})${flags}`;
    });

    const msg =
      `🗞️ *MemeRadar Daily Risk Digest*\n` +
      `${lines.length ? lines.join('\n') : 'No high-signal changes in last cycle.'}`;

    for (const chatId of this.subscribers) {
      try {
        await this.bot.telegram.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
      } catch (err) {
        console.error('[MemeRadar] Failed to push digest', err);
      }
    }
  }
}

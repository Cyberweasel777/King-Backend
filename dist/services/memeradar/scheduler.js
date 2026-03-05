"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemeRadarScheduler = void 0;
const index_1 = require("./index");
const alerts_1 = require("./alerts");
const middleware_1 = require("../../bots/telegram/shared/middleware");
class MemeRadarScheduler {
    bot;
    subscribers = new Set();
    scoreHistory = new Map();
    started = false;
    alertCooldownMs = 60 * 60 * 1000;
    alertLastSentAt = new Map();
    maxAlertMessagesPerPoll = 5;
    pollIntervalId;
    digestIntervalId;
    constructor(bot) {
        this.bot = bot;
    }
    subscribe(chatId) {
        this.subscribers.add(chatId);
    }
    unsubscribe(chatId) {
        this.subscribers.delete(chatId);
    }
    start() {
        if (this.started)
            return;
        this.started = true;
        this.pollIntervalId = setInterval(() => {
            if (!this.subscribers.size)
                return;
            this.pollAndPushAlerts().catch(err => console.error('[MemeRadar] alert loop error', err));
        }, 5 * 60 * 1000);
        this.digestIntervalId = setInterval(() => {
            if (!this.subscribers.size)
                return;
            this.pushDailyDigest().catch(err => console.error('[MemeRadar] digest loop error', err));
        }, 24 * 60 * 60 * 1000);
    }
    stop() {
        if (this.pollIntervalId)
            clearInterval(this.pollIntervalId);
        if (this.digestIntervalId)
            clearInterval(this.digestIntervalId);
        this.started = false;
    }
    async pollAndPushAlerts() {
        const trending = await (0, index_1.getTrending)({ limit: 20, chain: 'solana' });
        let sent = 0;
        for (const row of trending) {
            if (sent >= this.maxAlertMessagesPerPoll)
                break;
            const telemetry = {
                token: row.token,
                // limited data coverage in v1; keep only reliable signal active by default
                hasPaidBoost: (row.boostCount || 0) > 0,
                holderDispersionScore: row.token.holders > 3000 ? 60 : 25,
            };
            const alerts = (0, alerts_1.evaluateAlerts)(telemetry);
            if (!alerts.length)
                continue;
            const freshAlerts = alerts.filter((a) => {
                const key = `${row.token.address}:${a.type}`;
                const last = this.alertLastSentAt.get(key) || 0;
                if (Date.now() - last < this.alertCooldownMs)
                    return false;
                this.alertLastSentAt.set(key, Date.now());
                return true;
            });
            if (!freshAlerts.length)
                continue;
            const reportLines = freshAlerts
                .slice(0, 2)
                .map((a) => `• *${a.type}*: ${(0, middleware_1.escapeMd)(a.reason)}`)
                .join('\n');
            const msg = `🚨 *MemeRadar Alert*\n` +
                `Token: *${(0, middleware_1.escapeMd)(row.token.symbol)}* (${(0, middleware_1.shortAddress)(row.token.address)})\n` +
                `${reportLines}`;
            for (const chatId of this.subscribers) {
                try {
                    await this.bot.telegram.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
                }
                catch (err) {
                    console.error('[MemeRadar] Failed to push alert', err);
                }
            }
            sent += 1;
        }
    }
    async pushDailyDigest() {
        const trending = await (0, index_1.getTrending)({ limit: 10, chain: 'solana' });
        const digest = (0, alerts_1.buildDailyDigest)(trending, this.scoreHistory).slice(0, 5);
        for (const d of digest) {
            this.scoreHistory.set(d.address, d.score);
        }
        const lines = digest.map((d, i) => {
            const delta = d.scoreDelta === 0 ? '±0' : d.scoreDelta > 0 ? `+${d.scoreDelta}` : `${d.scoreDelta}`;
            const flags = d.newAlerts.length ? ` | alerts: ${d.newAlerts.length}` : '';
            return `${i + 1}. *${d.symbol}* — score ${d.score} (${delta})${flags}`;
        });
        const msg = `🗞️ *MemeRadar Daily Risk Digest*\n` +
            `${lines.length ? lines.join('\n') : 'No high-signal changes in last cycle.'}`;
        for (const chatId of this.subscribers) {
            try {
                await this.bot.telegram.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
            }
            catch (err) {
                console.error('[MemeRadar] Failed to push digest', err);
            }
        }
    }
}
exports.MemeRadarScheduler = MemeRadarScheduler;
//# sourceMappingURL=scheduler.js.map
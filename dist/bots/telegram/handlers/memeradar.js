"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMemeRadarBot = createMemeRadarBot;
const telegraf_1 = require("telegraf");
const payments_1 = require("../../shared/payments");
const memeradar_1 = require("../../../services/memeradar");
const scheduler_1 = require("../../../services/memeradar/scheduler");
const middleware_1 = require("../shared/middleware");
const logger_1 = require("../../../utils/logger");
const APP_ID = 'memeradar';
function rateGuard(ctx) {
    return (0, middleware_1.allowCommand)(ctx.from?.id?.toString());
}
function chatMeta(ctx) {
    const uid = ctx.from?.id ?? '?';
    const cid = ctx.chat?.id ?? '?';
    return `user=${uid} chat=${cid}`;
}
function createMemeRadarBot(token) {
    const bot = new telegraf_1.Telegraf(token);
    const scheduler = new scheduler_1.MemeRadarScheduler(bot);
    bot.command('start', async (ctx) => {
        await ctx.reply(`🐸 *MemeRadar* — Provenance Intelligence for memecoins\n\n` +
            `Use /token <address|ticker>, /trending, /whales <wallet>.\n` +
            `Enable push alerts with /alerts_on.`, { parse_mode: 'Markdown' });
    });
    bot.command('help', async (ctx) => {
        await ctx.reply(`*MemeRadar Commands*\n\n` +
            `/token <address|ticker> — Provenance score + risk factors\n` +
            `/trending — Top movers with risk overlay\n` +
            `/whales <wallet> — Whale flow + concentration warnings\n` +
            `/alerts_on — Enable push alerts + daily digest\n` +
            `/alerts_off — Disable push alerts\n\n` +
            `Billing: /status /pricing /subscribe`, { parse_mode: 'Markdown' });
    });
    bot.command('status', (0, payments_1.createStatusCommand)(APP_ID));
    bot.command('pricing', (0, payments_1.createPricingCommand)(APP_ID));
    bot.command('subscribe', (0, payments_1.createSubscribeCommand)(APP_ID));
    bot.command('alerts_on', async (ctx) => {
        scheduler.subscribe(ctx.chat.id);
        logger_1.logger.info({ chatId: ctx.chat?.id, username: ctx.from?.username }, 'alerts_on');
        await ctx.reply('✅ Alerts enabled. You will receive trigger alerts and a daily digest.');
    });
    bot.command('alerts_off', async (ctx) => {
        scheduler.unsubscribe(ctx.chat.id);
        logger_1.logger.info({ chatId: ctx.chat?.id, username: ctx.from?.username }, 'alerts_off');
        await ctx.reply('🛑 Alerts disabled for this chat.');
    });
    bot.command('trending', async (ctx) => {
        if (!rateGuard(ctx)) {
            await ctx.reply('⏱️ Rate limit hit. Wait a minute and try again.');
            return;
        }
        try {
            const trending = await (0, memeradar_1.getTrending)({ limit: 8, chain: 'solana' });
            if (!trending.length) {
                await ctx.reply('No trending tokens returned right now. Try again shortly.');
                return;
            }
            const lines = [];
            for (const t of trending.slice(0, 8)) {
                const report = (await (0, memeradar_1.getTokenReport)(t.token.address, 'solana'))?.provenance;
                const score = report?.score ?? 0;
                const risk = score >= 70 ? '🟢' : score >= 50 ? '🟡' : '🔴';
                lines.push(`${t.rank}. ${risk} *${t.token.symbol}* ` +
                    `(${t.token.priceChange24h.toFixed(1)}% 24h) | score ${score}`);
            }
            await ctx.reply(`🔥 *Trending Memes + Risk Overlay*\n\n${lines.join('\n')}`, { parse_mode: 'Markdown' });
        }
        catch (err) {
            logger_1.logger.error({ err, ctx: { chatId: ctx.chat?.id, username: ctx.from?.username } }, '/trending failed');
            await ctx.reply('⚠️ Failed to fetch trending data. Try again shortly.');
        }
    });
    bot.command('token', async (ctx) => {
        if (!rateGuard(ctx)) {
            await ctx.reply('⏱️ Rate limit hit. Wait a minute and try again.');
            return;
        }
        const identifier = (0, middleware_1.extractArg)(ctx.message?.text);
        if (!identifier) {
            await ctx.reply('Usage: /token <address|ticker>');
            return;
        }
        try {
            const report = await (0, memeradar_1.getTokenReport)(identifier, 'solana');
            if (!report) {
                await ctx.reply('Token not found. Try exact ticker or contract address.');
                return;
            }
            const { token: tk, provenance } = report;
            const risk = provenance.score >= 70 ? 'LOW' : provenance.score >= 50 ? 'MEDIUM' : 'HIGH';
            const topFactors = provenance.topRiskFactors
                .map((f) => `• ${f.name}: ${f.score}/100`)
                .join('\n');
            const why = provenance.whyFlagged.length
                ? provenance.whyFlagged.map((w) => `• ${w}`).join('\n')
                : '• No critical flags from current data.';
            await ctx.reply(`📊 *${(0, middleware_1.escapeMd)(tk.symbol)}* (${(0, middleware_1.shortAddress)(tk.address)})\n` +
                `Provenance: *${provenance.score}/100*\n` +
                `Confidence: *${provenance.confidence}%*\n` +
                `Risk: *${risk}*\n\n` +
                `Top risk factors:\n${topFactors}\n\n` +
                `Why flagged:\n${why}\n\n` +
                `Price: $${tk.priceUsd.toFixed(8)} | 24h: ${tk.priceChange24h.toFixed(2)}%\n` +
                `Liquidity: $${Math.round(tk.liquidityUsd).toLocaleString()} | Vol24h: $${Math.round(tk.volume24h).toLocaleString()}`, { parse_mode: 'Markdown' });
        }
        catch (err) {
            logger_1.logger.error({ err, ctx: { chatId: ctx.chat?.id, username: ctx.from?.username }, identifier }, '/token failed');
            await ctx.reply('⚠️ Failed to fetch token data. Try again shortly.');
        }
    });
    bot.command('whales', (0, payments_1.withSubscription)(APP_ID, 'pro'), async (ctx) => {
        if (!rateGuard(ctx)) {
            await ctx.reply('⏱️ Rate limit hit. Wait a minute and try again.');
            return;
        }
        const wallet = (0, middleware_1.extractArg)(ctx.message?.text);
        if (!wallet) {
            await ctx.reply('Usage: /whales <solana_wallet>');
            return;
        }
        try {
            const whales = await (0, memeradar_1.getWhales)({ wallet, limit: 8 });
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
            const lines = whales.slice(0, 6).map((w) => `• ${w.type.toUpperCase()} ${w.tokenOut} (${new Date(w.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })})`);
            await ctx.reply(`🐋 *Whale Activity*\n` +
                `Wallet: ${(0, middleware_1.shortAddress)(wallet)}\n` +
                `Buys: ${buys} | Sells: ${sells} | ${concentrationWarning}\n\n` +
                `${lines.join('\n')}`, { parse_mode: 'Markdown' });
        }
        catch (err) {
            logger_1.logger.error({ err, ctx: { chatId: ctx.chat?.id, username: ctx.from?.username }, wallet: (0, middleware_1.shortAddress)(wallet) }, '/whales failed');
            await ctx.reply('⚠️ Failed to fetch whale data. Try again shortly.');
        }
    });
    scheduler.start();
    bot.catch((err, ctx) => {
        const error = err instanceof Error ? err : new Error(String(err));
        logger_1.logger.error({ err: error, chatId: ctx.chat?.id, username: ctx.from?.username }, 'Unhandled error');
        ctx.reply('⚠️ MemeRadar encountered an error. Retry in a minute.').catch(() => { });
    });
    return bot;
}
exports.default = createMemeRadarBot;
//# sourceMappingURL=memeradar.js.map
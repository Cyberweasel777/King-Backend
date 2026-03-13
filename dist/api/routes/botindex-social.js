"use strict";
/**
 * BotIndex Social Routes — Twitter sentiment, convergence signals
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const x402Gate_1 = require("../middleware/x402Gate");
const social_cache_1 = require("../../services/social/social-cache");
const twitter_scraper_1 = require("../../services/social/twitter-scraper");
const sentiment_analyzer_1 = require("../../services/social/sentiment-analyzer");
const convergence_scorer_1 = require("../../services/social/convergence-scorer");
const twitter_crypto_watchlist_json_1 = __importDefault(require("../../services/social/twitter-crypto-watchlist.json"));
const logger_1 = __importDefault(require("../../config/logger"));
const router = (0, express_1.Router)();
const ACCOUNTS_MONITORED = twitter_crypto_watchlist_json_1.default.length;
const STALE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour
let backgroundRefreshRunning = false;
const METADATA = {
    protocol: 'x402',
    version: '1.0',
    provider: 'BotIndex',
    source: 'twitter_watchlist',
    accounts_monitored: ACCOUNTS_MONITORED,
};
// Background auto-refresh when cache is stale (fire-and-forget, non-blocking)
async function maybeBackgroundRefresh() {
    const age = (0, social_cache_1.getCacheAge)();
    if (backgroundRefreshRunning)
        return;
    if (age !== null && age < STALE_THRESHOLD_MS)
        return;
    backgroundRefreshRunning = true;
    const limit = Math.min(50, ACCOUNTS_MONITORED); // lighter refresh for background
    const handles = twitter_crypto_watchlist_json_1.default.slice(0, limit).map((a) => a.screen_name);
    try {
        logger_1.default.info({ handles: handles.length }, 'Social auto-refresh: starting background scrape');
        const tweets = await (0, twitter_scraper_1.fetchRecentTweets)(handles, 5);
        const accountsWithTweets = new Set(tweets.map((t) => t.handle)).size;
        const sentimentResults = await (0, sentiment_analyzer_1.analyzeSentiment)(tweets);
        const convergenceSignals = (0, convergence_scorer_1.scoreConvergence)(sentimentResults);
        (0, social_cache_1.updateCache)({
            convergenceSignals,
            sentimentResults,
            tweets,
            accountsScraped: handles.length,
            accountsWithTweets,
            durationMs: 0,
        });
        logger_1.default.info({ tweets: tweets.length }, 'Social auto-refresh: complete');
    }
    catch (err) {
        logger_1.default.warn({ err }, 'Social auto-refresh: failed (will retry on next request)');
    }
    finally {
        backgroundRefreshRunning = false;
    }
}
// GET /social/convergence — top convergence signals (scored, ranked)
router.get('/social/convergence', (0, x402Gate_1.createX402Gate)({ price: '$0.02', description: 'Cross-platform convergence signals from crypto Twitter' }), (_req, res) => {
    void maybeBackgroundRefresh();
    const cache = (0, social_cache_1.getCache)();
    const ageMs = (0, social_cache_1.getCacheAge)();
    res.json({
        signals: cache.convergenceSignals.slice(0, 50),
        count: cache.convergenceSignals.length,
        lastRefresh: cache.lastRefresh,
        cacheAgeMinutes: ageMs !== null ? Math.round(ageMs / 60000) : null,
        stale: ageMs !== null ? ageMs > 30 * 60 * 1000 : true,
        metadata: { ...METADATA, endpoint: '/social/convergence' },
    });
});
// GET /social/twitter/sentiment?token=SOL — per-token sentiment
router.get('/social/twitter/sentiment', (0, x402Gate_1.createX402Gate)({ price: '$0.02', description: 'Per-token Twitter sentiment from crypto watchlist' }), (req, res) => {
    void maybeBackgroundRefresh();
    const token = (req.query.token || '').toUpperCase();
    const cache = (0, social_cache_1.getCache)();
    if (token) {
        const filtered = cache.sentimentResults.filter((r) => r.tokens.some((t) => t.toUpperCase() === token));
        res.json({
            token,
            results: filtered.slice(0, 100),
            count: filtered.length,
            lastRefresh: cache.lastRefresh,
            metadata: { ...METADATA, endpoint: '/social/twitter/sentiment' },
        });
    }
    else {
        // Return top tokens by mention count
        const tokenCounts = new Map();
        for (const r of cache.sentimentResults) {
            for (const t of r.tokens) {
                tokenCounts.set(t, (tokenCounts.get(t) || 0) + 1);
            }
        }
        const ranked = Array.from(tokenCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 50)
            .map(([token, count]) => ({ token, mentions: count }));
        res.json({
            tokens: ranked,
            totalResults: cache.sentimentResults.length,
            lastRefresh: cache.lastRefresh,
            hint: 'Add ?token=SOL to filter by specific token',
            metadata: { ...METADATA, endpoint: '/social/twitter/sentiment' },
        });
    }
});
// GET /social/twitter/narratives — trending narrative clusters
router.get('/social/twitter/narratives', (0, x402Gate_1.createX402Gate)({ price: '$0.02', description: 'Trending narrative clusters from crypto Twitter' }), (_req, res) => {
    void maybeBackgroundRefresh();
    const cache = (0, social_cache_1.getCache)();
    // Cluster tokens by co-occurrence
    const coOccurrence = new Map();
    for (const r of cache.sentimentResults) {
        if (r.tokens.length < 2)
            continue;
        for (const t of r.tokens) {
            const related = coOccurrence.get(t) || new Set();
            for (const other of r.tokens) {
                if (other !== t)
                    related.add(other);
            }
            coOccurrence.set(t, related);
        }
    }
    const narratives = Array.from(coOccurrence.entries())
        .map(([token, related]) => ({
        anchor: token,
        relatedTokens: Array.from(related).slice(0, 10),
        clusterSize: related.size + 1,
    }))
        .filter((n) => n.clusterSize >= 3)
        .sort((a, b) => b.clusterSize - a.clusterSize)
        .slice(0, 20);
    res.json({
        narratives,
        count: narratives.length,
        lastRefresh: cache.lastRefresh,
        metadata: { ...METADATA, endpoint: '/social/twitter/narratives' },
    });
});
// GET /social/twitter/trending — most mentioned tokens in last 4 hours
router.get('/social/twitter/trending', (0, x402Gate_1.createX402Gate)({ price: '$0.02', description: 'Trending tokens on crypto Twitter (last 4 hours)' }), (_req, res) => {
    void maybeBackgroundRefresh();
    const cache = (0, social_cache_1.getCache)();
    const fourHoursAgo = Date.now() - 4 * 60 * 60 * 1000;
    const recent = cache.sentimentResults.filter((r) => Date.parse(r.timestamp) > fourHoursAgo);
    const tokenData = new Map();
    for (const r of recent) {
        for (const t of r.tokens) {
            const existing = tokenData.get(t) || { mentions: 0, bullish: 0, bearish: 0, neutral: 0, handles: new Set() };
            existing.mentions++;
            existing[r.sentiment]++;
            existing.handles.add(r.handle);
            tokenData.set(t, existing);
        }
    }
    const trending = Array.from(tokenData.entries())
        .map(([token, data]) => ({
        token,
        mentions: data.mentions,
        uniqueAccounts: data.handles.size,
        sentiment: {
            bullish: data.bullish,
            bearish: data.bearish,
            neutral: data.neutral,
        },
        dominantSentiment: data.bullish > data.bearish ? 'bullish' : data.bearish > data.bullish ? 'bearish' : 'neutral',
    }))
        .sort((a, b) => b.mentions - a.mentions)
        .slice(0, 30);
    res.json({
        trending,
        count: trending.length,
        window: '4h',
        totalTweetsAnalyzed: recent.length,
        lastRefresh: cache.lastRefresh,
        metadata: { ...METADATA, endpoint: '/social/twitter/trending' },
    });
});
// POST /social/refresh — admin-only pipeline trigger
router.post('/social/refresh', async (req, res) => {
    const adminId = req.query.adminId;
    if (adminId !== '8063432083') {
        res.status(403).json({ error: 'unauthorized' });
        return;
    }
    const startTime = Date.now();
    const limit = Math.min(Number(req.query.limit) || 100, ACCOUNTS_MONITORED);
    const handles = twitter_crypto_watchlist_json_1.default.slice(0, limit).map((a) => a.screen_name);
    try {
        logger_1.default.info({ handles: handles.length }, 'Social refresh: starting scrape');
        const tweets = await (0, twitter_scraper_1.fetchRecentTweets)(handles, 5);
        const accountsWithTweets = new Set(tweets.map((t) => t.handle)).size;
        logger_1.default.info({ tweets: tweets.length, accountsWithTweets }, 'Social refresh: analyzing sentiment');
        const sentimentResults = await (0, sentiment_analyzer_1.analyzeSentiment)(tweets);
        logger_1.default.info({ results: sentimentResults.length }, 'Social refresh: scoring convergence');
        const convergenceSignals = (0, convergence_scorer_1.scoreConvergence)(sentimentResults);
        const durationMs = Date.now() - startTime;
        (0, social_cache_1.updateCache)({
            convergenceSignals,
            sentimentResults,
            tweets,
            accountsScraped: handles.length,
            accountsWithTweets,
            durationMs,
        });
        logger_1.default.info({ durationMs, tweets: tweets.length, signals: convergenceSignals.length }, 'Social refresh complete');
        res.json({
            status: 'ok',
            accountsScraped: handles.length,
            accountsWithTweets,
            tweetsCollected: tweets.length,
            sentimentResults: sentimentResults.length,
            convergenceSignals: convergenceSignals.length,
            topSignals: convergenceSignals.slice(0, 5),
            durationMs,
        });
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Social refresh failed');
        res.status(500).json({
            error: 'refresh_failed',
            message: error instanceof Error ? error.message : 'Unknown error',
            durationMs: Date.now() - startTime,
        });
    }
});
// POST /social/ingest — accept pre-scraped tweets from local Mac
router.post('/social/ingest', async (req, res) => {
    const adminId = req.query.adminId;
    if (adminId !== '8063432083') {
        res.status(403).json({ error: 'unauthorized' });
        return;
    }
    const startTime = Date.now();
    const { tweets, accountsScraped, accountsWithTweets } = req.body;
    if (!Array.isArray(tweets)) {
        res.status(400).json({ error: 'tweets must be an array' });
        return;
    }
    try {
        logger_1.default.info({ tweets: tweets.length }, 'Social ingest: analyzing sentiment');
        const sentimentResults = await (0, sentiment_analyzer_1.analyzeSentiment)(tweets);
        logger_1.default.info({ results: sentimentResults.length }, 'Social ingest: scoring convergence');
        const convergenceSignals = (0, convergence_scorer_1.scoreConvergence)(sentimentResults);
        const durationMs = Date.now() - startTime;
        (0, social_cache_1.updateCache)({
            convergenceSignals,
            sentimentResults,
            tweets,
            accountsScraped: accountsScraped || 0,
            accountsWithTweets: accountsWithTweets || 0,
            durationMs,
        });
        logger_1.default.info({ durationMs, tweets: tweets.length, signals: convergenceSignals.length }, 'Social ingest complete');
        res.json({
            status: 'ok',
            tweetsIngested: tweets.length,
            sentimentResults: sentimentResults.length,
            convergenceSignals: convergenceSignals.length,
            topSignals: convergenceSignals.slice(0, 5),
            durationMs,
        });
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Social ingest failed');
        res.status(500).json({
            error: 'ingest_failed',
            message: error instanceof Error ? error.message : 'Unknown error',
            durationMs: Date.now() - startTime,
        });
    }
});
exports.default = router;
//# sourceMappingURL=botindex-social.js.map
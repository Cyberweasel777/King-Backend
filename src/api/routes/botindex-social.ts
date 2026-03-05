/**
 * BotIndex Social Routes — Twitter sentiment, convergence signals
 */

import { Request, Response, Router } from 'express';
import { createX402Gate } from '../middleware/x402Gate';
import { getCache, getCacheAge, updateCache } from '../../services/social/social-cache';
import { fetchRecentTweets } from '../../services/social/twitter-scraper';
import { analyzeSentiment } from '../../services/social/sentiment-analyzer';
import { scoreConvergence } from '../../services/social/convergence-scorer';
import watchlist from '../../services/social/twitter-crypto-watchlist.json';
import logger from '../../config/logger';

const router = Router();
const ACCOUNTS_MONITORED = watchlist.length;

const METADATA = {
  protocol: 'x402',
  version: '1.0',
  provider: 'BotIndex',
  source: 'twitter_watchlist',
  accounts_monitored: ACCOUNTS_MONITORED,
} as const;

// GET /social/convergence — top convergence signals (scored, ranked)
router.get(
  '/social/convergence',
  createX402Gate({ price: '$0.02', description: 'Cross-platform convergence signals from crypto Twitter' }),
  (_req: Request, res: Response) => {
    const cache = getCache();
    const ageMs = getCacheAge();

    res.json({
      signals: cache.convergenceSignals.slice(0, 50),
      count: cache.convergenceSignals.length,
      lastRefresh: cache.lastRefresh,
      cacheAgeMinutes: ageMs !== null ? Math.round(ageMs / 60000) : null,
      stale: ageMs !== null ? ageMs > 30 * 60 * 1000 : true,
      metadata: { ...METADATA, endpoint: '/social/convergence' },
    });
  }
);

// GET /social/twitter/sentiment?token=SOL — per-token sentiment
router.get(
  '/social/twitter/sentiment',
  createX402Gate({ price: '$0.02', description: 'Per-token Twitter sentiment from crypto watchlist' }),
  (req: Request, res: Response) => {
    const token = (req.query.token as string || '').toUpperCase();
    const cache = getCache();

    if (token) {
      const filtered = cache.sentimentResults.filter((r) =>
        r.tokens.some((t) => t.toUpperCase() === token)
      );
      res.json({
        token,
        results: filtered.slice(0, 100),
        count: filtered.length,
        lastRefresh: cache.lastRefresh,
        metadata: { ...METADATA, endpoint: '/social/twitter/sentiment' },
      });
    } else {
      // Return top tokens by mention count
      const tokenCounts = new Map<string, number>();
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
  }
);

// GET /social/twitter/narratives — trending narrative clusters
router.get(
  '/social/twitter/narratives',
  createX402Gate({ price: '$0.02', description: 'Trending narrative clusters from crypto Twitter' }),
  (_req: Request, res: Response) => {
    const cache = getCache();

    // Cluster tokens by co-occurrence
    const coOccurrence = new Map<string, Set<string>>();
    for (const r of cache.sentimentResults) {
      if (r.tokens.length < 2) continue;
      for (const t of r.tokens) {
        const related = coOccurrence.get(t) || new Set();
        for (const other of r.tokens) {
          if (other !== t) related.add(other);
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
  }
);

// GET /social/twitter/trending — most mentioned tokens in last 4 hours
router.get(
  '/social/twitter/trending',
  createX402Gate({ price: '$0.02', description: 'Trending tokens on crypto Twitter (last 4 hours)' }),
  (_req: Request, res: Response) => {
    const cache = getCache();
    const fourHoursAgo = Date.now() - 4 * 60 * 60 * 1000;

    const recent = cache.sentimentResults.filter(
      (r) => Date.parse(r.timestamp) > fourHoursAgo
    );

    const tokenData = new Map<string, { mentions: number; bullish: number; bearish: number; neutral: number; handles: Set<string> }>();

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
        dominantSentiment: data.bullish > data.bearish ? 'bullish' as const : data.bearish > data.bullish ? 'bearish' as const : 'neutral' as const,
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
  }
);

// POST /social/refresh — admin-only pipeline trigger
router.post(
  '/social/refresh',
  async (req: Request, res: Response) => {
    const adminId = req.query.adminId as string;
    if (adminId !== '8063432083') {
      res.status(403).json({ error: 'unauthorized' });
      return;
    }

    const startTime = Date.now();
    const limit = Math.min(Number(req.query.limit) || 100, ACCOUNTS_MONITORED);
    const handles = watchlist.slice(0, limit).map((a) => a.screen_name);

    try {
      logger.info({ handles: handles.length }, 'Social refresh: starting scrape');
      const tweets = await fetchRecentTweets(handles, 5);
      const accountsWithTweets = new Set(tweets.map((t) => t.handle)).size;

      logger.info({ tweets: tweets.length, accountsWithTweets }, 'Social refresh: analyzing sentiment');
      const sentimentResults = await analyzeSentiment(tweets);

      logger.info({ results: sentimentResults.length }, 'Social refresh: scoring convergence');
      const convergenceSignals = scoreConvergence(sentimentResults);

      const durationMs = Date.now() - startTime;

      updateCache({
        convergenceSignals,
        sentimentResults,
        tweets,
        accountsScraped: handles.length,
        accountsWithTweets,
        durationMs,
      });

      logger.info(
        { durationMs, tweets: tweets.length, signals: convergenceSignals.length },
        'Social refresh complete'
      );

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
    } catch (error) {
      logger.error({ err: error }, 'Social refresh failed');
      res.status(500).json({
        error: 'refresh_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        durationMs: Date.now() - startTime,
      });
    }
  }
);

export default router;

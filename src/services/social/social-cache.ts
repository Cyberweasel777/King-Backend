/**
 * Social Sentiment Cache — in-memory + file persistence
 * Follows the same pattern as freeTrial.ts ledger
 */

import fs from 'fs';
import path from 'path';
import logger from '../../config/logger';
import type { ConvergenceSignal } from './convergence-scorer';
import type { SentimentResult } from './sentiment-analyzer';
import type { Tweet } from './twitter-scraper';

const CACHE_FILE = path.join(
  process.env.DATA_DIR || '/data',
  'social-sentiment-cache.json'
);
const FLUSH_INTERVAL_MS = 30_000;

interface SocialCacheData {
  convergenceSignals: ConvergenceSignal[];
  sentimentResults: SentimentResult[];
  tweetCount: number;
  lastRefresh: string | null;
  refreshDurationMs: number | null;
  accountsScraped: number;
  accountsWithTweets: number;
}

let cache: SocialCacheData = {
  convergenceSignals: [],
  sentimentResults: [],
  tweetCount: 0,
  lastRefresh: null,
  refreshDurationMs: null,
  accountsScraped: 0,
  accountsWithTweets: 0,
};

let dirty = false;

function loadFromDisk(): void {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<SocialCacheData>;
      cache = { ...cache, ...parsed };
      logger.info({ file: CACHE_FILE }, 'Social sentiment cache loaded from disk');
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to load social sentiment cache from disk');
  }
}

function flushToDisk(): void {
  if (!dirty) return;
  try {
    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
    dirty = false;
  } catch (err) {
    logger.warn({ err }, 'Failed to flush social sentiment cache to disk');
  }
}

// Load on startup
loadFromDisk();

// Flush every 30s
setInterval(flushToDisk, FLUSH_INTERVAL_MS);

export function getCache(): SocialCacheData {
  return cache;
}

export function getCacheAge(): number | null {
  if (!cache.lastRefresh) return null;
  return Date.now() - Date.parse(cache.lastRefresh);
}

export function updateCache(update: {
  convergenceSignals: ConvergenceSignal[];
  sentimentResults: SentimentResult[];
  tweets: Tweet[];
  accountsScraped: number;
  accountsWithTweets: number;
  durationMs: number;
}): void {
  cache.convergenceSignals = update.convergenceSignals;
  cache.sentimentResults = update.sentimentResults;
  cache.tweetCount = update.tweets.length;
  cache.lastRefresh = new Date().toISOString();
  cache.refreshDurationMs = update.durationMs;
  cache.accountsScraped = update.accountsScraped;
  cache.accountsWithTweets = update.accountsWithTweets;
  dirty = true;

  // Immediate flush after refresh
  flushToDisk();
}

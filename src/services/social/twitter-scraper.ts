import logger from '../../config/logger';

const SYNDICATION_BASE_URL = 'https://syndication.twitter.com/srv/timeline-profile/screen-name';
const NITTER_BASE_URL = 'https://nitter.net';
const DEFAULT_MAX_PER_ACCOUNT = 5;
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 15000;

const REQUEST_HEADERS: Record<string, string> = {
  'Accept': 'text/html,application/json,application/rss+xml;q=0.9,*/*;q=0.8',
  'User-Agent': 'Mozilla/5.0 (compatible; BotIndexSocialScraper/1.0)',
};

export interface Tweet {
  handle: string;
  text: string;
  timestamp: string;
  likes: number;
  retweets: number;
  replies: number;
}

interface SyndicationTweetObject {
  text?: string;
  full_text?: string;
  created_at?: string;
  timestamp_ms?: string | number;
  favorite_count?: number | string;
  retweet_count?: number | string;
  reply_count?: number | string;
}

interface SyndicationPayload {
  body?: string;
  tweets?: SyndicationTweetObject[];
  globalObjects?: {
    tweets?: Record<string, SyndicationTweetObject>;
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeHandle(handle: string): string {
  return handle.replace(/^@+/, '').trim();
}

function decodeHtmlEntities(input: string): string {
  const named = input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&nbsp;/g, ' ');

  return named.replace(/&#(\d+);/g, (_m, code) => {
    const parsed = Number.parseInt(code, 10);
    if (Number.isNaN(parsed)) return '';
    return String.fromCharCode(parsed);
  });
}

function stripHtml(input: string): string {
  return decodeHtmlEntities(input)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseCount(raw: string | number | undefined): number {
  if (raw === undefined) return 0;
  if (typeof raw === 'number') return Number.isFinite(raw) ? Math.max(0, raw) : 0;

  const normalized = raw.trim().toUpperCase().replace(/,/g, '');
  if (!normalized) return 0;

  const suffix = normalized.slice(-1);
  const base = Number.parseFloat(suffix.match(/[KMB]/) ? normalized.slice(0, -1) : normalized);
  if (!Number.isFinite(base)) return 0;

  if (suffix === 'K') return Math.round(base * 1_000);
  if (suffix === 'M') return Math.round(base * 1_000_000);
  if (suffix === 'B') return Math.round(base * 1_000_000_000);
  return Math.round(base);
}

function toIsoTimestamp(raw: string | number | undefined): string {
  if (raw === undefined) return new Date().toISOString();

  if (typeof raw === 'number') {
    return new Date(raw).toISOString();
  }

  const trimmed = String(raw).trim();
  if (!trimmed) return new Date().toISOString();

  if (/^\d+$/.test(trimmed)) {
    return new Date(Number.parseInt(trimmed, 10)).toISOString();
  }

  const parsedMs = Date.parse(trimmed);
  if (!Number.isNaN(parsedMs)) return new Date(parsedMs).toISOString();

  return new Date().toISOString();
}

function dedupeTweets(tweets: Tweet[]): Tweet[] {
  const map = new Map<string, Tweet>();
  for (const tweet of tweets) {
    const key = `${tweet.handle}|${tweet.timestamp}|${tweet.text}`;
    if (!map.has(key)) {
      map.set(key, tweet);
    }
  }
  return Array.from(map.values());
}

function parseJsonEscapedString(raw: string): string {
  try {
    return JSON.parse(`"${raw.replace(/"/g, '\\"')}"`) as string;
  } catch {
    return raw;
  }
}

function parseTweetFromObject(handle: string, tweet: SyndicationTweetObject): Tweet | null {
  const textRaw = tweet.full_text ?? tweet.text ?? '';
  const text = stripHtml(String(textRaw));
  if (!text) return null;

  return {
    handle,
    text,
    timestamp: toIsoTimestamp(tweet.timestamp_ms ?? tweet.created_at),
    likes: parseCount(tweet.favorite_count),
    retweets: parseCount(tweet.retweet_count),
    replies: parseCount(tweet.reply_count),
  };
}

function parseSyndicationJson(handle: string, payload: SyndicationPayload): Tweet[] {
  const tweets: Tweet[] = [];

  const directTweets = Array.isArray(payload.tweets) ? payload.tweets : [];
  for (const row of directTweets) {
    const parsed = parseTweetFromObject(handle, row);
    if (parsed) tweets.push(parsed);
  }

  const globalTweets = payload.globalObjects?.tweets
    ? Object.values(payload.globalObjects.tweets)
    : [];
  for (const row of globalTweets) {
    const parsed = parseTweetFromObject(handle, row);
    if (parsed) tweets.push(parsed);
  }

  return tweets;
}

function extractMetricFromLabel(block: string, label: 'likes' | 'retweets' | 'replies'): number {
  const rx = new RegExp(`([\\d.,KMBkmb]+)\\s*${label}`, 'gi');
  let max = 0;
  for (const match of block.matchAll(rx)) {
    max = Math.max(max, parseCount(match[1]));
  }
  return max;
}

function parseSyndicationHtml(handle: string, html: string): Tweet[] {
  const blocks: string[] = [];
  for (const match of html.matchAll(/<li[^>]*timeline-TweetList-tweet[\s\S]*?<\/li>/gi)) {
    blocks.push(match[0]);
  }
  for (const match of html.matchAll(/<article[^>]*[\s\S]*?<\/article>/gi)) {
    blocks.push(match[0]);
  }

  const tweets: Tweet[] = [];

  for (const block of blocks) {
    const textMatch = block.match(/data-tweet-text="([^"]+)"/i)
      ?? block.match(/<p[^>]*timeline-Tweet-text[^>]*>([\s\S]*?)<\/p>/i)
      ?? block.match(/<p[^>]*tweet-content[^>]*>([\s\S]*?)<\/p>/i);

    const text = textMatch ? stripHtml(textMatch[1]) : '';
    if (!text) continue;

    const timestampMsMatch = block.match(/data-time-ms="(\d+)"/i);
    const datetimeMatch = block.match(/datetime="([^"]+)"/i)
      ?? block.match(/data-datetime="([^"]+)"/i);

    const statMatches = Array.from(block.matchAll(/data-tweet-stat-count="([^"]+)"/gi))
      .map((m) => parseCount(m[1]))
      .filter((n) => n > 0);

    let replies = extractMetricFromLabel(block, 'replies');
    let retweets = extractMetricFromLabel(block, 'retweets');
    let likes = extractMetricFromLabel(block, 'likes');

    if (likes === 0 && retweets === 0 && replies === 0 && statMatches.length > 0) {
      // Most embed snippets expose stats in replies, retweets, likes order.
      replies = statMatches[0] ?? 0;
      retweets = statMatches[1] ?? 0;
      likes = statMatches[2] ?? 0;
    }

    tweets.push({
      handle,
      text,
      timestamp: toIsoTimestamp(timestampMsMatch?.[1] ?? datetimeMatch?.[1]),
      likes,
      retweets,
      replies,
    });
  }

  return tweets;
}

function parseEmbeddedJsonTweets(handle: string, raw: string): Tweet[] {
  const textMatches = Array.from(raw.matchAll(/"(?:full_text|text)"\s*:\s*"((?:\\.|[^"\\])*)"/g));
  const createdMatches = Array.from(raw.matchAll(/"created_at"\s*:\s*"((?:\\.|[^"\\])*)"/g));
  const favoriteMatches = Array.from(raw.matchAll(/"favorite_count"\s*:\s*(\d+)/g));
  const retweetMatches = Array.from(raw.matchAll(/"retweet_count"\s*:\s*(\d+)/g));
  const replyMatches = Array.from(raw.matchAll(/"reply_count"\s*:\s*(\d+)/g));

  const count = Math.min(textMatches.length, 20);
  const tweets: Tweet[] = [];

  for (let i = 0; i < count; i += 1) {
    const text = stripHtml(parseJsonEscapedString(textMatches[i][1]));
    if (!text) continue;
    tweets.push({
      handle,
      text,
      timestamp: toIsoTimestamp(createdMatches[i]?.[1]),
      likes: parseCount(favoriteMatches[i]?.[1]),
      retweets: parseCount(retweetMatches[i]?.[1]),
      replies: parseCount(replyMatches[i]?.[1]),
    });
  }

  return tweets;
}

function parseSyndicationResponse(handle: string, body: string, maxPerAccount: number): Tweet[] {
  try {
    const payload = JSON.parse(body) as SyndicationPayload;
    const parsedJsonTweets = parseSyndicationJson(handle, payload);
    if (parsedJsonTweets.length > 0) {
      return dedupeTweets(parsedJsonTweets)
        .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
        .slice(0, maxPerAccount);
    }

    if (typeof payload.body === 'string') {
      const parsedHtmlTweets = parseSyndicationHtml(handle, payload.body);
      if (parsedHtmlTweets.length > 0) {
        return dedupeTweets(parsedHtmlTweets)
          .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
          .slice(0, maxPerAccount);
      }
    }
  } catch {
    // Response is not JSON, continue with HTML parser.
  }

  const parsedHtmlTweets = parseSyndicationHtml(handle, body);
  if (parsedHtmlTweets.length > 0) {
    return dedupeTweets(parsedHtmlTweets)
      .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
      .slice(0, maxPerAccount);
  }

  return dedupeTweets(parseEmbeddedJsonTweets(handle, body))
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
    .slice(0, maxPerAccount);
}

async function fetchFromSyndication(handle: string, maxPerAccount: number): Promise<Tweet[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const url = `${SYNDICATION_BASE_URL}/${encodeURIComponent(handle)}`;

  try {
    const response = await fetch(url, {
      headers: REQUEST_HEADERS,
      signal: controller.signal,
    });

    if (!response.ok) {
      if ([401, 403, 404, 429].includes(response.status)) {
        logger.info({ handle, status: response.status }, 'Twitter syndication unavailable for handle');
      } else {
        logger.warn({ handle, status: response.status }, 'Twitter syndication returned non-OK status');
      }
      return [];
    }

    const body = await response.text();
    return parseSyndicationResponse(handle, body, maxPerAccount);
  } catch (error) {
    logger.warn(
      { err: error, handle },
      'Failed to fetch tweets from syndication endpoint'
    );
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

function extractRssTag(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  if (!match) return '';
  return match[1].trim();
}

function parseNitterRss(handle: string, xml: string, maxPerAccount: number): Tweet[] {
  const tweets: Tweet[] = [];

  for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const item = match[1];
    const description = extractRssTag(item, 'description');
    const title = extractRssTag(item, 'title');
    const pubDate = extractRssTag(item, 'pubDate');

    const text = stripHtml(description || title);
    if (!text) continue;

    tweets.push({
      handle,
      text,
      timestamp: toIsoTimestamp(pubDate),
      likes: 0,
      retweets: 0,
      replies: 0,
    });
  }

  return dedupeTweets(tweets)
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
    .slice(0, maxPerAccount);
}

async function fetchFromNitterRss(handle: string, maxPerAccount: number): Promise<Tweet[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const url = `${NITTER_BASE_URL}/${encodeURIComponent(handle)}/rss`;

  try {
    const response = await fetch(url, {
      headers: REQUEST_HEADERS,
      signal: controller.signal,
    });

    if (!response.ok) {
      logger.info({ handle, status: response.status }, 'Nitter RSS unavailable for handle');
      return [];
    }

    const xml = await response.text();
    return parseNitterRss(handle, xml, maxPerAccount);
  } catch (error) {
    logger.warn({ err: error, handle }, 'Failed to fetch Nitter RSS');
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchTweetsForHandle(handle: string, maxPerAccount: number): Promise<Tweet[]> {
  try {
    const fromSyndication = await fetchFromSyndication(handle, maxPerAccount);
    if (fromSyndication.length > 0) {
      return fromSyndication;
    }

    return await fetchFromNitterRss(handle, maxPerAccount);
  } catch (error) {
    logger.error({ err: error, handle }, 'Unexpected scraper failure for handle');
    return [];
  }
}

export async function fetchRecentTweets(
  handles: string[],
  maxPerAccount: number = DEFAULT_MAX_PER_ACCOUNT
): Promise<Tweet[]> {
  const normalizedHandles = Array.from(
    new Set(handles.map(normalizeHandle).filter((h) => h.length > 0))
  );

  if (normalizedHandles.length === 0) {
    return [];
  }

  const allTweets: Tweet[] = [];

  for (let i = 0; i < normalizedHandles.length; i += BATCH_SIZE) {
    const batch = normalizedHandles.slice(i, i + BATCH_SIZE);
    const batchTweets = await Promise.all(
      batch.map((handle) => fetchTweetsForHandle(handle, maxPerAccount))
    );

    for (const tweets of batchTweets) {
      allTweets.push(...tweets);
    }

    if (i + BATCH_SIZE < normalizedHandles.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  return dedupeTweets(allTweets).sort(
    (a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)
  );
}

import type { NextFunction, Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import logger from '../../config/logger';
import { getOptionalConvexAnalyticsStore } from '../../shared/analytics/convex-client';

type HitEntry = {
  count: number;
  lastHit: string;
  uniqueVisitors: number;
  visitorHashes: string[];
};

type PersistedData = {
  hits: Record<string, HitEntry>;
  firstSeen: string;
  lastFlushed: string;
  globalVisitorHashes?: string[];
};

const DATA_DIR = process.env.DATA_DIR || '/data';
const HITS_FILE = path.join(DATA_DIR, 'hits.json');
const QUERY_SURGE_FILE = path.join(DATA_DIR, 'query-surge-history.jsonl');
const SURGE_ALERTS_FILE = path.join(DATA_DIR, 'surge-alerts-history.jsonl');
const FLUSH_INTERVAL_MS = 60_000; // 60 seconds
const SURGE_WINDOW_MS = 5 * 60 * 1000; // 5-minute windows
const SPIKE_MULTIPLIER = 3; // 3x average = spike
const MIN_SPIKE_COUNT = 10; // minimum absolute hits to trigger (avoid noise on low-traffic endpoints)
const ROLLING_WINDOWS = 12; // 1 hour of history (12 x 5-min windows)
const TELEGRAM_CHAT_ID = process.env.SURGE_ALERT_CHAT_ID || '8063432083';
const TELEGRAM_BOT_TOKEN = process.env.BOTINDEX_BOT_TOKEN || '';

// Per-endpoint request counts in 5-minute windows for surge detection
const surgeWindows = new Map<string, number>();
let currentSurgeWindowStart = Math.floor(Date.now() / SURGE_WINDOW_MS) * SURGE_WINDOW_MS;

// Rolling average tracker: endpoint -> array of recent window counts
const rollingHistory = new Map<string, number[]>();

// Cooldown: don't alert for same endpoint more than once per 30 min
const alertCooldowns = new Map<string, number>();
const ALERT_COOLDOWN_MS = 30 * 60 * 1000;

async function sendTelegramAlert(message: string): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) {
    logger.warn('No BOTINDEX_BOT_TOKEN set — skipping surge alert');
    return;
  }
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'HTML',
        disable_notification: false,
      }),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, 'Telegram surge alert send failed');
    }
  } catch (err) {
    logger.warn({ err }, 'Telegram surge alert error');
  }
}

function detectAndAlertSpikes(windows: Array<{ endpoint: string; count: number }>): void {
  const now = Date.now();
  const spikes: Array<{ endpoint: string; count: number; average: number; multiplier: number }> = [];

  for (const { endpoint, count } of windows) {
    // Update rolling history
    const history = rollingHistory.get(endpoint) || [];
    history.push(count);
    if (history.length > ROLLING_WINDOWS) history.shift();
    rollingHistory.set(endpoint, history);

    // Need at least 3 windows of history to compare
    if (history.length < 3) continue;

    // Calculate average excluding current window
    const pastWindows = history.slice(0, -1);
    const avg = pastWindows.reduce((a, b) => a + b, 0) / pastWindows.length;

    // Check for spike
    if (count >= MIN_SPIKE_COUNT && avg > 0 && count >= avg * SPIKE_MULTIPLIER) {
      // Check cooldown
      const lastAlert = alertCooldowns.get(endpoint) || 0;
      if (now - lastAlert < ALERT_COOLDOWN_MS) continue;

      const multiplier = Math.round((count / avg) * 10) / 10;
      spikes.push({ endpoint, count, average: Math.round(avg * 10) / 10, multiplier });
      alertCooldowns.set(endpoint, now);
    }
  }

  if (spikes.length === 0) return;

  // Log to file
  try {
    fs.appendFileSync(SURGE_ALERTS_FILE, JSON.stringify({
      timestamp: new Date().toISOString(),
      spikes,
    }) + '\n');
  } catch {
    // Non-fatal
  }

  // Build and send Telegram alert
  const lines = spikes.map(s =>
    `• <b>${s.endpoint}</b>: ${s.count} hits (${s.multiplier}x avg of ${s.average})`
  );

  const message = [
    '🚨 <b>BotIndex Query Surge Alert</b>',
    '',
    ...lines,
    '',
    `Window: ${new Date(currentSurgeWindowStart).toISOString().slice(11, 16)} UTC`,
    'Developers are moving. Check what tokens/endpoints are spiking.',
  ].join('\n');

  void sendTelegramAlert(message);
  logger.info({ spikes: spikes.length }, 'Query surge alert fired');
}

function flushSurgeWindow(): void {
  const now = Date.now();
  const newWindowStart = Math.floor(now / SURGE_WINDOW_MS) * SURGE_WINDOW_MS;

  if (newWindowStart <= currentSurgeWindowStart) return;
  if (surgeWindows.size === 0) {
    currentSurgeWindowStart = newWindowStart;
    return;
  }

  const windows: Array<{ endpoint: string; count: number }> = [];
  for (const [endpoint, count] of surgeWindows) {
    windows.push({ endpoint, count });
  }
  windows.sort((a, b) => b.count - a.count);

  const record = {
    timestamp: new Date().toISOString(),
    window_start: new Date(currentSurgeWindowStart).toISOString(),
    window_end: new Date(currentSurgeWindowStart + SURGE_WINDOW_MS).toISOString(),
    total_requests: windows.reduce((sum, w) => sum + w.count, 0),
    unique_endpoints: windows.length,
    top_5: windows.slice(0, 5),
    peak: windows[0] || null,
  };

  try {
    fs.appendFileSync(QUERY_SURGE_FILE, JSON.stringify(record) + '\n');
  } catch {
    // Non-fatal
  }

  // Detect spikes and alert
  detectAndAlertSpikes(windows);

  surgeWindows.clear();
  currentSurgeWindowStart = newWindowStart;
}

const hits: Record<string, HitEntry> = {};
const globalVisitorHashes = new Set<string>();
let firstSeen: string;
const startTime = Date.now();
let dirty = false;
const convexAnalyticsStore = getOptionalConvexAnalyticsStore();
let lastConvexErrorAt = 0;

function normalizeHitEntry(entry: Partial<HitEntry> | undefined): HitEntry {
  const visitorHashes = Array.isArray(entry?.visitorHashes)
    ? Array.from(new Set(entry.visitorHashes.filter((v): v is string => typeof v === 'string')))
    : [];

  return {
    count: typeof entry?.count === 'number' ? entry.count : 0,
    lastHit: typeof entry?.lastHit === 'string' ? entry.lastHit : '',
    uniqueVisitors: visitorHashes.length,
    visitorHashes,
  };
}

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];

  if (Array.isArray(forwarded) && forwarded.length > 0 && forwarded[0]) {
    return forwarded[0].split(',')[0].trim();
  }

  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }

  return req.ip || 'unknown';
}

function hashIp(ip: string): string {
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 12);
}

function optionalHeader(req: Request, headerName: string): string | undefined {
  const raw = req.get(headerName);
  if (!raw) return undefined;
  const value = raw.trim();
  return value.length > 0 ? value : undefined;
}

function shouldTrack(pathname: string): boolean {
  return pathname.includes('botindex') || pathname.includes('x402') || pathname.includes('polyhacks');
}

function beaconKey(req: Request): string | null {
  if (req.path.endsWith('/botindex/beacon')) {
    const page = typeof req.query.page === 'string' ? req.query.page : 'unknown';
    return `/botindex/beacon:${page}`;
  }
  if (req.path.endsWith('/polyhacks/beacon')) {
    const page = typeof req.query.page === 'string' ? req.query.page : 'unknown';
    return `/polyhacks/beacon:${page}`;
  }
  return null;
}

function reportConvexLogError(error: unknown): void {
  const now = Date.now();
  if (now - lastConvexErrorAt < 60_000) return;
  lastConvexErrorAt = now;
  logger.warn({ err: error }, 'Convex analytics logging failed; continuing with file-based hit counter');
}

// Load persisted hits on startup
function loadFromDisk(): void {
  try {
    if (fs.existsSync(HITS_FILE)) {
      const raw = fs.readFileSync(HITS_FILE, 'utf-8');
      const data = JSON.parse(raw) as Partial<PersistedData>;

      if (data.hits && typeof data.hits === 'object') {
        for (const [endpoint, entry] of Object.entries(data.hits)) {
          const normalized = normalizeHitEntry(entry);
          hits[endpoint] = normalized;
          for (const hash of normalized.visitorHashes) {
            globalVisitorHashes.add(hash);
          }
        }
      }

      if (Array.isArray(data.globalVisitorHashes)) {
        for (const hash of data.globalVisitorHashes) {
          if (typeof hash === 'string') {
            globalVisitorHashes.add(hash);
          }
        }
      }

      if (typeof data.firstSeen === 'string' && data.firstSeen) {
        firstSeen = data.firstSeen;
      }
    }
  } catch {
    // Corrupted or missing file — start fresh
  }

  if (!firstSeen) {
    firstSeen = new Date().toISOString();
  }
}

function flushToDisk(): void {
  if (!dirty) return;
  try {
    // Ensure data dir exists (no-op if volume mounted)
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const data: PersistedData = {
      hits,
      firstSeen,
      lastFlushed: new Date().toISOString(),
      globalVisitorHashes: Array.from(globalVisitorHashes),
    };
    fs.writeFileSync(HITS_FILE, JSON.stringify(data), 'utf-8');
    dirty = false;
  } catch {
    // Non-fatal — volume may not be mounted (dev mode)
  }
}

// Initialize
loadFromDisk();
setInterval(flushToDisk, FLUSH_INTERVAL_MS);
setInterval(flushSurgeWindow, SURGE_WINDOW_MS);
// Flush on graceful shutdown
process.on('SIGTERM', () => { flushToDisk(); flushSurgeWindow(); });
process.on('SIGINT', () => { flushToDisk(); flushSurgeWindow(); });

export function hitCounter(req: Request, res: Response, next: NextFunction): void {
  const p = req.path;

  if (shouldTrack(p)) {
    // For beacon requests, split by page param for per-site tracking
    const trackKey = beaconKey(req) || p;

    if (!hits[trackKey]) {
      hits[trackKey] = { count: 0, lastHit: '', uniqueVisitors: 0, visitorHashes: [] };
    }

    const entry = hits[trackKey];
    entry.count += 1;
    entry.lastHit = new Date().toISOString();

    // Track query surge (5-min windows for behavioral analysis)
    const surgeKey = trackKey;
    surgeWindows.set(surgeKey, (surgeWindows.get(surgeKey) || 0) + 1);

    const visitorHash = hashIp(getClientIp(req));
    const requestStartedAt = Date.now();
    const walletAddress = optionalHeader(req, 'X-Wallet');
    const userAgent = optionalHeader(req, 'User-Agent');
    const referrer = optionalHeader(req, 'Referer') || optionalHeader(req, 'Referrer');
    const hasXPaymentHeader = Boolean(optionalHeader(req, 'X-Payment'));
    const apiKeyPlan = req.apiKeyAuth?.plan;
    const apiKeyHash = req.apiKeyAuth?.apiKey ? hashIp(req.apiKeyAuth.apiKey) : undefined;

    if (!entry.visitorHashes.includes(visitorHash)) {
      entry.visitorHashes.push(visitorHash);
      entry.uniqueVisitors = entry.visitorHashes.length;
    }

    globalVisitorHashes.add(visitorHash);
    dirty = true;

    res.once('finish', () => {
      if (!convexAnalyticsStore) return;

      void convexAnalyticsStore
        .logRequest({
          endpoint: p,
          method: req.method,
          visitorHash,
          walletAddress,
          userAgent,
          referrer,
          statusCode: res.statusCode,
          x402Paid: hasXPaymentHeader && res.statusCode !== 402,
          responseTimeMs: Date.now() - requestStartedAt,
          timestamp: Date.now(),
          apiKeyHash,
          apiKeyPlan,
        })
        .catch(reportConvexLogError);
    });
  }

  next();
}

export function getHits() {
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
  const totalHits = Object.values(hits).reduce((sum, entry) => sum + entry.count, 0);

  return {
    uptime_seconds: uptimeSeconds,
    total_hits: totalHits,
    unique_visitors_total: globalVisitorHashes.size,
    hits_per_minute: uptimeSeconds > 0 ? Number((totalHits / (uptimeSeconds / 60)).toFixed(2)) : 0,
    endpoints: hits,
    since: firstSeen,
    last_restart: new Date(startTime).toISOString(),
  };
}

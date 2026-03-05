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
const FLUSH_INTERVAL_MS = 60_000; // 60 seconds

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
  return pathname.includes('botindex') || pathname.includes('x402');
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
// Flush on graceful shutdown
process.on('SIGTERM', flushToDisk);
process.on('SIGINT', flushToDisk);

export function hitCounter(req: Request, res: Response, next: NextFunction): void {
  const p = req.path;

  if (shouldTrack(p)) {
    if (!hits[p]) {
      hits[p] = { count: 0, lastHit: '', uniqueVisitors: 0, visitorHashes: [] };
    }

    const entry = hits[p];
    entry.count += 1;
    entry.lastHit = new Date().toISOString();

    const visitorHash = hashIp(getClientIp(req));
    const requestStartedAt = Date.now();
    const walletAddress = optionalHeader(req, 'X-Wallet');
    const userAgent = optionalHeader(req, 'User-Agent');
    const referrer = optionalHeader(req, 'Referer') || optionalHeader(req, 'Referrer');
    const hasXPaymentHeader = Boolean(optionalHeader(req, 'X-Payment'));

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

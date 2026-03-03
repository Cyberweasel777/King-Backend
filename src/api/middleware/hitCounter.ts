import type { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

type HitEntry = {
  count: number;
  lastHit: string;
};

type PersistedData = {
  hits: Record<string, HitEntry>;
  firstSeen: string;
  lastFlushed: string;
};

const DATA_DIR = process.env.DATA_DIR || '/data';
const HITS_FILE = path.join(DATA_DIR, 'hits.json');
const FLUSH_INTERVAL_MS = 60_000; // 60 seconds

const hits: Record<string, HitEntry> = {};
let firstSeen: string;
const startTime = Date.now();
let dirty = false;

// Load persisted hits on startup
function loadFromDisk(): void {
  try {
    if (fs.existsSync(HITS_FILE)) {
      const raw = fs.readFileSync(HITS_FILE, 'utf-8');
      const data: PersistedData = JSON.parse(raw);
      Object.assign(hits, data.hits);
      firstSeen = data.firstSeen;
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

export function hitCounter(req: Request, _res: Response, next: NextFunction): void {
  const p = req.path;

  if (p.includes('botindex') || p.includes('x402')) {
    if (!hits[p]) {
      hits[p] = { count: 0, lastHit: '' };
    }

    hits[p].count += 1;
    hits[p].lastHit = new Date().toISOString();
    dirty = true;
  }

  next();
}

export function getHits() {
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
  const totalHits = Object.values(hits).reduce((sum, entry) => sum + entry.count, 0);

  return {
    uptime_seconds: uptimeSeconds,
    total_hits: totalHits,
    hits_per_minute: uptimeSeconds > 0 ? Number((totalHits / (uptimeSeconds / 60)).toFixed(2)) : 0,
    endpoints: hits,
    since: firstSeen,
    last_restart: new Date(startTime).toISOString(),
  };
}

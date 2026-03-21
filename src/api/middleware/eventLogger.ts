/**
 * Event Logger Middleware
 *
 * Append-only JSONL request log for attribution, retention, and bot classification.
 * Every HTTP request = one line in /data/events.jsonl.
 *
 * Buffered: accumulates in memory, flushes every 10s to avoid blocking the event loop.
 */

import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { getAllApiKeys } from './apiKeyAuth';

const DATA_DIR = process.env.DATA_DIR || process.env.API_KEY_DATA_DIR || '/data';
const EVENT_LOG = path.join(DATA_DIR, 'events.jsonl');
const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100MB rotation threshold
const SALT = 'botindex-ev-2026';
const FLUSH_INTERVAL_MS = 10_000;

let buffer: string[] = [];

// Per-IP daily call counter (anon tracking)
const dailyIpCounts = new Map<string, number>();
let currentDay = todayUTC();

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

export function hashIp(ip: string): string {
  return crypto.createHash('sha256').update(ip + SALT).digest('hex').slice(0, 16);
}

function getClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string') return fwd.split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

export function eventLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on('finish', () => {
    try {
      const day = todayUTC();
      if (day !== currentDay) {
        dailyIpCounts.clear();
        currentDay = day;
      }

      const ipRaw = getClientIp(req);
      const ip = hashIp(ipRaw);
      const ipDayKey = `${ip}:${day}`;
      const count = (dailyIpCounts.get(ipDayKey) || 0) + 1;
      dailyIpCounts.set(ipDayKey, count);

      const keyRaw = req.apiKeyAuth?.apiKey;
      const line = JSON.stringify({
        t: new Date().toISOString(),
        ip,
        key: keyRaw ? keyRaw.slice(-8) : null,
        ua: (req.headers['user-agent'] || '').slice(0, 200),
        path: req.path,
        method: req.method,
        status: res.statusCode,
        ms: Date.now() - start,
        auth: !!req.apiKeyAuth,
        plan: req.apiKeyAuth?.plan || 'anon',
        calls_today: req.apiKeyAuth ? (req.apiKeyAuth as any)._dailyCount || 0 : count,
      });
      buffer.push(line);
    } catch {
      // non-fatal — never break request handling
    }
  });

  next();
}

// Flush buffer to disk periodically
function flushBuffer(): void {
  if (buffer.length === 0) return;
  const batch = buffer.join('\n') + '\n';
  buffer = [];
  try {
    // Rotate if file exceeds threshold
    try {
      const stat = fs.statSync(EVENT_LOG);
      if (stat.size > MAX_FILE_BYTES) {
        const rotated = EVENT_LOG + '.1';
        // Remove old rotation if exists, then rename
        try { fs.unlinkSync(rotated); } catch { /* ok */ }
        fs.renameSync(EVENT_LOG, rotated);
      }
    } catch { /* file doesn't exist yet, fine */ }

    fs.appendFileSync(EVENT_LOG, batch);
  } catch {
    // non-fatal
  }
}

const flushTimer = setInterval(flushBuffer, FLUSH_INTERVAL_MS);
flushTimer.unref();

process.on('SIGTERM', flushBuffer);
process.on('SIGINT', flushBuffer);

// --- Admin Endpoints ---

export function eventsSummaryHandler(req: Request, res: Response): void {
  try {
    if (!fs.existsSync(EVENT_LOG)) {
      res.json({ total_events: 0, error: 'no event log found yet' });
      return;
    }

    const raw = fs.readFileSync(EVENT_LOG, 'utf-8');
    const lines = raw.trim().split('\n').filter(Boolean);
    const last24h = Date.now() - 86_400_000;

    const pathCounts: Record<string, number> = {};
    const uaCounts: Record<string, number> = {};
    const uniqueIps = new Set<string>();
    let total = 0;
    let authed = 0;
    let anon = 0;
    let recent = 0;

    for (const line of lines) {
      try {
        const e = JSON.parse(line);
        total++;
        uniqueIps.add(e.ip);
        pathCounts[e.path] = (pathCounts[e.path] || 0) + 1;
        if (e.ua) {
          // Group by first token of UA string (e.g. "python-requests", "curl", "Mozilla")
          const uaShort = e.ua.split(/[/ ]/)[0] || e.ua.slice(0, 40);
          uaCounts[uaShort] = (uaCounts[uaShort] || 0) + 1;
        }
        if (e.auth) authed++;
        else anon++;
        if (new Date(e.t).getTime() >= last24h) recent++;
      } catch { /* skip malformed lines */ }
    }

    const topPaths = Object.entries(pathCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25)
      .map(([p, c]) => ({ path: p, count: c, pct: `${((c / total) * 100).toFixed(1)}%` }));

    const topUAs = Object.entries(uaCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25)
      .map(([ua, c]) => ({ user_agent: ua, count: c, pct: `${((c / total) * 100).toFixed(1)}%` }));

    res.json({
      total_events: total,
      events_last_24h: recent,
      unique_ips: uniqueIps.size,
      authenticated: authed,
      anonymous: anon,
      auth_pct: total > 0 ? `${((authed / total) * 100).toFixed(1)}%` : '0%',
      top_paths: topPaths,
      top_user_agents: topUAs,
      log_file: EVENT_LOG,
    });
  } catch (err) {
    res.status(500).json({ error: 'failed to read event log', detail: String(err) });
  }
}

export function keyHealthHandler(_req: Request, res: Response): void {
  try {
    const keys = getAllApiKeys();
    const today = todayUTC();
    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);

    let total = 0;
    let activated1 = 0;
    let activated2 = 0;
    let activeToday = 0;
    let active7d = 0;
    const planBreakdown: Record<string, number> = {};
    const secondCallHours: number[] = [];

    for (const { entry } of keys) {
      total++;
      planBreakdown[entry.plan] = (planBreakdown[entry.plan] || 0) + 1;
      if (entry.requestCount >= 1) activated1++;
      if (entry.requestCount >= 2) activated2++;

      const lastActive = (entry as any).last_active_date as string | undefined;
      if (lastActive === today) activeToday++;
      if (lastActive && lastActive >= sevenDaysAgo) active7d++;

      const scHours = (entry as any).second_call_hours as number | undefined;
      if (scHours !== undefined) secondCallHours.push(scHours);
    }

    // Median helper
    const median = (arr: number[]) => {
      if (arr.length === 0) return null;
      const sorted = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    };

    res.json({
      total_keys: total,
      activated_1_call: activated1,
      activated_2_calls: activated2,
      active_today: activeToday,
      active_7d: active7d,
      retention_7d_pct: activated1 > 0
        ? `${((active7d / activated1) * 100).toFixed(1)}%`
        : 'N/A',
      median_hours_to_second_call: median(secondCallHours),
      by_plan: planBreakdown,
    });
  } catch (err) {
    res.status(500).json({ error: 'failed to compute key health', detail: String(err) });
  }
}

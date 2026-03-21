import fs from 'fs';
import path from 'path';

const DATA_DIR = process.env.API_KEY_DATA_DIR || '/data';
const FUNNEL_LEDGER_FILE = path.join(DATA_DIR, 'funnel-tracker-ledger.json');
const FLUSH_INTERVAL_MS = 30_000; // flush to disk every 30s

export interface FunnelEvent {
  step: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

const MAX_EVENTS = 10_000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

const KNOWN_STEPS = [
  'key_issued',
  'key_issued_paid',
  'first_auth_call',
  'second_auth_call',
  'key_daily_active',
  'paywall_hit',
  'rate_limit_hit',
  'upgrade_cta_shown',
  'checkout_redirect',
  'stripe_webhook_received',
  'anon_rate_limit_429',
  'soft_gate_truncated',
  'cta_injected',
] as const;

type StepSummary = { total: number; last24h: number; lastHour: number };

const events: FunnelEvent[] = [];
const totalByStep = new Map<string, number>();
const firstAuthSeenKeys = new Set<string>();
let dirty = false;

// --- Persistence ---

interface LedgerSnapshot {
  totalByStep: Record<string, number>;
  events: FunnelEvent[];
  savedAt: string;
}

function loadFromDisk(): void {
  try {
    if (!fs.existsSync(FUNNEL_LEDGER_FILE)) return;
    const raw = fs.readFileSync(FUNNEL_LEDGER_FILE, 'utf-8');
    const snap: LedgerSnapshot = JSON.parse(raw);

    if (snap.totalByStep) {
      for (const [step, count] of Object.entries(snap.totalByStep)) {
        totalByStep.set(step, count);
      }
    }

    if (Array.isArray(snap.events)) {
      for (const e of snap.events.slice(-MAX_EVENTS)) {
        events.push(e);
      }
    }
  } catch {
    // non-fatal — start fresh
  }
}

function flushToDisk(): void {
  if (!dirty) return;
  try {
    const snap: LedgerSnapshot = {
      totalByStep: Object.fromEntries(totalByStep),
      events: events.slice(-MAX_EVENTS),
      savedAt: new Date().toISOString(),
    };
    const tmp = FUNNEL_LEDGER_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(snap), 'utf-8');
    fs.renameSync(tmp, FUNNEL_LEDGER_FILE);
    dirty = false;
  } catch {
    // non-fatal — will retry next interval
  }
}

// Load on module init
loadFromDisk();

// Periodic flush
setInterval(flushToDisk, FLUSH_INTERVAL_MS).unref();

// Flush on graceful shutdown
process.on('SIGTERM', () => { flushToDisk(); });
process.on('SIGINT', () => { flushToDisk(); });

// --- Core API ---

function normalizeLimit(limit?: number): number {
  if (!Number.isFinite(limit)) return 20;
  return Math.min(1_000, Math.max(1, Math.floor(limit as number)));
}

function cloneMetadata(metadata?: Record<string, any>): Record<string, any> | undefined {
  if (!metadata) return undefined;
  const cloned = { ...metadata };
  if ('apiKey' in cloned) {
    delete cloned.apiKey;
  }
  return Object.keys(cloned).length > 0 ? cloned : undefined;
}

export function trackFunnelEvent(step: string, metadata?: Record<string, any>): void {
  if (!step) return;

  if (step === 'first_auth_call') {
    const rawApiKey = metadata?.apiKey;
    const dedupeKey = typeof rawApiKey === 'string' && rawApiKey.length > 0 ? rawApiKey : null;
    if (dedupeKey) {
      if (firstAuthSeenKeys.has(dedupeKey)) {
        return;
      }
      firstAuthSeenKeys.add(dedupeKey);
    }
  }

  const event: FunnelEvent = {
    step,
    timestamp: new Date().toISOString(),
  };

  const sanitizedMetadata = cloneMetadata(metadata);
  if (sanitizedMetadata) {
    event.metadata = sanitizedMetadata;
  }

  events.push(event);
  if (events.length > MAX_EVENTS) {
    events.shift();
  }

  totalByStep.set(step, (totalByStep.get(step) || 0) + 1);
  dirty = true;
}

export function getFunnelSummary(): { [step: string]: StepSummary } {
  const summary: { [step: string]: StepSummary } = {};
  for (const step of KNOWN_STEPS) {
    summary[step] = {
      total: totalByStep.get(step) || 0,
      last24h: 0,
      lastHour: 0,
    };
  }

  for (const [step, total] of totalByStep.entries()) {
    if (!summary[step]) {
      summary[step] = {
        total,
        last24h: 0,
        lastHour: 0,
      };
    }
  }

  const nowMs = Date.now();
  const hourAgoMs = nowMs - ONE_HOUR_MS;
  const dayAgoMs = nowMs - ONE_DAY_MS;

  for (const event of events) {
    const ts = Date.parse(event.timestamp);
    if (!Number.isFinite(ts)) continue;

    if (!summary[event.step]) {
      summary[event.step] = {
        total: totalByStep.get(event.step) || 0,
        last24h: 0,
        lastHour: 0,
      };
    }

    if (ts >= dayAgoMs) {
      summary[event.step].last24h += 1;
    }
    if (ts >= hourAgoMs) {
      summary[event.step].lastHour += 1;
    }
  }

  return summary;
}

export function getRecentEvents(step?: string, limit?: number): FunnelEvent[] {
  const effectiveLimit = normalizeLimit(limit);
  const output: FunnelEvent[] = [];

  for (let i = events.length - 1; i >= 0 && output.length < effectiveLimit; i -= 1) {
    const event = events[i];
    if (step && event.step !== step) continue;
    output.push(event);
  }

  return output;
}

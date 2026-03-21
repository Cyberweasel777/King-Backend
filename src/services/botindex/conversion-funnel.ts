import fs from 'fs';
import path from 'path';
import logger from '../../config/logger';

export type FunnelEventType =
  | 'register_page_hit'
  | 'sentinel_interstitial_shown'
  | 'checkout_session_created'
  | 'checkout_completed'
  | 'api_key_issued';

type FunnelEvent = {
  type: FunnelEventType;
  ts: string;
  // legacy compatibility for old snapshots
  timestamp?: string;
  plan?: 'free' | 'basic' | 'pro' | 'starter' | 'sentinel' | 'enterprise';
  source?: string;   // endpoint that drove this event (from ?source= param)
  referer?: string;  // Referer header value
};

type FunnelStore = {
  events: FunnelEvent[];
};

const DATA_DIR = process.env.API_KEY_DATA_DIR || '/data';
const FILE = path.join(DATA_DIR, 'conversion-funnel.json');
const MAX_EVENTS = 5000;

const store: FunnelStore = { events: [] };
let flushScheduled = false;

function load(): void {
  try {
    if (!fs.existsSync(FILE)) return;
    const raw = fs.readFileSync(FILE, 'utf-8');
    const parsed = JSON.parse(raw) as FunnelStore;
    if (Array.isArray(parsed.events)) {
      // normalize legacy entries that used `timestamp` instead of `ts`
      const normalized = parsed.events.map((e) => ({
        ...e,
        ts: e.ts || e.timestamp || new Date().toISOString(),
      }));
      store.events = normalized.slice(-MAX_EVENTS);
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to load conversion funnel ledger');
  }
}

async function flush(): Promise<void> {
  try {
    await fs.promises.mkdir(DATA_DIR, { recursive: true });
    await fs.promises.writeFile(FILE, JSON.stringify(store, null, 2), 'utf-8');
  } catch (err) {
    logger.warn({ err }, 'Failed to flush conversion funnel ledger');
  }
}

function scheduleFlush(): void {
  if (flushScheduled) return;
  flushScheduled = true;
  setTimeout(() => {
    flushScheduled = false;
    void flush();
  }, 500);
}

export function trackFunnelEvent(
  type: FunnelEventType,
  plan?: 'free' | 'basic' | 'pro' | 'starter' | 'sentinel' | 'enterprise',
  source?: string,
  referer?: string,
): void {
  const event: FunnelEvent = { type, plan, ts: new Date().toISOString() };
  if (source) event.source = source;
  if (referer) event.referer = referer;
  store.events.push(event);
  if (store.events.length > MAX_EVENTS) {
    store.events = store.events.slice(-MAX_EVENTS);
  }
  scheduleFlush();
}

export function getFunnelStats() {
  const events = store.events;
  const count = (type: FunnelEventType) => events.filter((e) => e.type === type).length;

  const registerHits = count('register_page_hit');
  const checkoutCreated = count('checkout_session_created');
  const checkoutCompleted = count('checkout_completed');
  const apiKeysIssued = count('api_key_issued');

  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

  return {
    since: events[0]?.ts || null,
    eventsTracked: events.length,
    registerHits,
    checkoutCreated,
    checkoutCompleted,
    apiKeysIssued,
    conversion: {
      registerToCheckoutPct: pct(checkoutCreated, registerHits),
      checkoutToCompletePct: pct(checkoutCompleted, checkoutCreated),
      completeToKeyPct: pct(apiKeysIssued, checkoutCompleted),
      registerToKeyPct: pct(apiKeysIssued, registerHits),
    },
    lastEventAt: events[events.length - 1]?.ts || null,
  };
}

load();

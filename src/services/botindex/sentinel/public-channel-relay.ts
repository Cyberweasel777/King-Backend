import fs from 'fs';
import logger from '../../../config/logger';
import { generateSignalCard, type SignalCardInput } from './signal-card-generator';

const PUBLIC_CHANNEL_ID = process.env.BOTINDEX_PUBLIC_CHANNEL_ID || '';
const RELAY_DELAY_MS = 30 * 60 * 1000; // 30 minutes
const TELEGRAM_BOT_TOKEN = process.env.BOTINDEX_BOT_TOKEN || '';
const RELAY_HISTORY_LOG = '/data/public-relay-history.jsonl';

interface QueuedRelay {
  id: string;
  queuedAt: string;
  relayAt: string;
  signal: SignalCardInput;
}

const relayQueue = new Map<string, QueuedRelay>();
const relayTimers = new Map<string, NodeJS.Timeout>();

function appendRelayHistory(record: unknown): void {
  try {
    fs.appendFileSync(RELAY_HISTORY_LOG, JSON.stringify(record) + '\n');
  } catch {
    // non-fatal
  }
}

function truncateLine(text: string, maxLen: number): string {
  const singleLine = (text || '').replace(/\s+/g, ' ').trim();
  if (singleLine.length <= maxLen) return singleLine;
  return `${singleLine.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`;
}

function formatEntry(price: number | null): string {
  if (price === null || !Number.isFinite(price)) return 'N/A';
  if (price >= 1000) return `$${price.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  if (price >= 1) return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 8 })}`;
}

function buildCaption(signal: SignalCardInput): string {
  const entry = formatEntry(signal.entry_price_usd);
  const narrative = truncateLine(signal.narrative, 220);

  return [
    `🎯 SIGNAL: ${signal.asset.toUpperCase()} — ${signal.direction.toUpperCase()}`,
    `Strength: ${Math.max(0, Math.min(100, Math.round(signal.strength)))}/100`,
    narrative,
    '',
    `Entry: ${entry}`,
    `Signal time: ${signal.timestamp} (30-min delayed)`,
    '',
    '⚡ Real-time signals → botindex.dev',
  ].join('\n');
}

async function sendPhotoToChannel(photo: Buffer, caption: string): Promise<void> {
  const form = new FormData();
  form.append('chat_id', PUBLIC_CHANNEL_ID);
  form.append('caption', caption);
  form.append('photo', new Blob([photo], { type: 'image/png' }), 'sentinel-signal.png');

  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
    method: 'POST',
    body: form,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`sendPhoto failed (${response.status}): ${errorBody}`);
  }
}

async function sendTextToChannel(text: string): Promise<void> {
  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: PUBLIC_CHANNEL_ID,
      text,
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`sendMessage failed (${response.status}): ${errorBody}`);
  }
}

async function relayQueuedSignal(queueId: string): Promise<void> {
  const queued = relayQueue.get(queueId);
  relayQueue.delete(queueId);
  relayTimers.delete(queueId);

  if (!queued) return;

  let sentPhoto = false;
  let sentText = false;
  let error: string | null = null;

  try {
    if (!TELEGRAM_BOT_TOKEN || !PUBLIC_CHANNEL_ID) {
      throw new Error('Public relay disabled: missing BOTINDEX_BOT_TOKEN or BOTINDEX_PUBLIC_CHANNEL_ID');
    }

    const caption = buildCaption(queued.signal);

    // Text-only relay — signal cards don't render text on Alpine/Fly (no system fonts for SVG)
    await sendTextToChannel(caption);
    sentText = true;

    logger.info(
      { queueId, asset: queued.signal.asset, direction: queued.signal.direction, strength: queued.signal.strength },
      'Public channel signal relayed',
    );
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    logger.error({ err: error, queueId, signal: queued.signal }, 'Public channel relay failed');

    // Best-effort fallback: still attempt text-only when image relay fails.
    if (!sentText && TELEGRAM_BOT_TOKEN && PUBLIC_CHANNEL_ID) {
      try {
        await sendTextToChannel(buildCaption(queued.signal));
        sentText = true;
      } catch (textErr) {
        logger.error(
          { err: textErr instanceof Error ? textErr.message : String(textErr), queueId },
          'Public channel text fallback failed',
        );
      }
    }
  } finally {
    appendRelayHistory({
      queue_id: queued.id,
      queued_at: queued.queuedAt,
      relay_at: queued.relayAt,
      processed_at: new Date().toISOString(),
      signal: queued.signal,
      sent_photo: sentPhoto,
      sent_text: sentText,
      error,
    });
  }
}

export function queueSignalForRelay(signal: SignalCardInput): void {
  const queuedAtMs = Date.now();
  const relayAtMs = queuedAtMs + RELAY_DELAY_MS;
  const id = `relay-${queuedAtMs}-${Math.random().toString(36).slice(2, 8)}`;

  const queued: QueuedRelay = {
    id,
    queuedAt: new Date(queuedAtMs).toISOString(),
    relayAt: new Date(relayAtMs).toISOString(),
    signal: {
      ...signal,
      asset: signal.asset.toUpperCase(),
      narrative: truncateLine(signal.narrative, 220),
      direction: signal.direction,
    },
  };

  relayQueue.set(id, queued);

  const timeout = setTimeout(() => {
    void relayQueuedSignal(id);
  }, RELAY_DELAY_MS);
  relayTimers.set(id, timeout);

  logger.info(
    {
      queueId: id,
      asset: queued.signal.asset,
      direction: queued.signal.direction,
      strength: queued.signal.strength,
      relayAt: queued.relayAt,
      queueSize: relayQueue.size,
    },
    'Queued signal for delayed public relay',
  );
}

export function startPublicRelay(): void {
  logger.info('Public channel relay ready');
}

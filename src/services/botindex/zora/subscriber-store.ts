import fs from 'fs';
import path from 'path';
import logger from '../../../config/logger';

export type ZoraAlphaSubscriberStatus = 'trial' | 'active' | 'expired' | 'cancelled';

export type ZoraAlphaSubscriberRecord = {
  chatId: number;
  status: ZoraAlphaSubscriberStatus;
  stripeCustomerId?: string;
  subscribedAt: string;
  expiresAt?: string;
};

export type ZoraAlphaSubscriberMap = Record<string, ZoraAlphaSubscriberRecord>;

export const ZORA_ALPHA_SUBSCRIBERS_FILE = '/data/zora_alpha_subscribers.json';

let writeChain: Promise<void> = Promise.resolve();

function normalizeStatus(value: unknown): ZoraAlphaSubscriberStatus | null {
  if (value === 'trial' || value === 'active' || value === 'expired' || value === 'cancelled') {
    return value;
  }
  return null;
}

function normalizeRecord(value: unknown): ZoraAlphaSubscriberRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  const chatId = Number(record.chatId);
  const status = normalizeStatus(record.status);
  const subscribedAt = typeof record.subscribedAt === 'string' ? record.subscribedAt : '';

  if (!Number.isFinite(chatId) || !status || !subscribedAt) return null;

  return {
    chatId,
    status,
    stripeCustomerId: typeof record.stripeCustomerId === 'string' ? record.stripeCustomerId : undefined,
    subscribedAt,
    expiresAt: typeof record.expiresAt === 'string' ? record.expiresAt : undefined,
  };
}

function normalizeMap(value: unknown): ZoraAlphaSubscriberMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const parsed = value as Record<string, unknown>;
  const out: ZoraAlphaSubscriberMap = {};

  for (const [telegramUserId, record] of Object.entries(parsed)) {
    const normalized = normalizeRecord(record);
    if (!normalized) continue;
    out[telegramUserId] = normalized;
  }

  return out;
}

async function ensureDirectoryExists(): Promise<void> {
  await fs.promises.mkdir(path.dirname(ZORA_ALPHA_SUBSCRIBERS_FILE), { recursive: true });
}

export async function loadZoraAlphaSubscribers(): Promise<ZoraAlphaSubscriberMap> {
  try {
    if (!fs.existsSync(ZORA_ALPHA_SUBSCRIBERS_FILE)) {
      return {};
    }

    const raw = await fs.promises.readFile(ZORA_ALPHA_SUBSCRIBERS_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    return normalizeMap(parsed);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to load Zora Alpha subscribers file');
    return {};
  }
}

export async function saveZoraAlphaSubscribers(subscribers: ZoraAlphaSubscriberMap): Promise<void> {
  await ensureDirectoryExists();
  await fs.promises.writeFile(
    ZORA_ALPHA_SUBSCRIBERS_FILE,
    JSON.stringify(subscribers, null, 2),
    'utf-8'
  );
}

async function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeChain.then(fn, fn);
  writeChain = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

export async function updateZoraAlphaSubscribers(
  updater: (current: ZoraAlphaSubscriberMap) => ZoraAlphaSubscriberMap | void | Promise<ZoraAlphaSubscriberMap | void>
): Promise<ZoraAlphaSubscriberMap> {
  return withWriteLock(async () => {
    const current = await loadZoraAlphaSubscribers();
    const draft: ZoraAlphaSubscriberMap = { ...current };
    const updated = await updater(draft);
    const next = updated ?? draft;
    await saveZoraAlphaSubscribers(next);
    return next;
  });
}

export async function getZoraAlphaSubscriber(
  telegramUserId: string
): Promise<ZoraAlphaSubscriberRecord | null> {
  const subscribers = await loadZoraAlphaSubscribers();
  return subscribers[telegramUserId] || null;
}

export async function upsertZoraAlphaSubscriber(
  telegramUserId: string,
  updater: (current: ZoraAlphaSubscriberRecord | null) => ZoraAlphaSubscriberRecord
): Promise<ZoraAlphaSubscriberRecord> {
  let updatedRecord: ZoraAlphaSubscriberRecord | null = null;

  await updateZoraAlphaSubscribers((subscribers) => {
    const next = updater(subscribers[telegramUserId] || null);
    subscribers[telegramUserId] = next;
    updatedRecord = next;
  });

  if (!updatedRecord) {
    throw new Error('Failed to upsert Zora Alpha subscriber');
  }

  return updatedRecord;
}

export async function findZoraAlphaSubscriberByStripeCustomerId(
  stripeCustomerId: string
): Promise<{ telegramUserId: string; subscriber: ZoraAlphaSubscriberRecord } | null> {
  if (!stripeCustomerId) return null;

  const subscribers = await loadZoraAlphaSubscribers();

  for (const [telegramUserId, subscriber] of Object.entries(subscribers)) {
    if (subscriber.stripeCustomerId === stripeCustomerId) {
      return { telegramUserId, subscriber };
    }
  }

  return null;
}

export function mapStripeStatusToSubscriberStatus(stripeStatus: string): ZoraAlphaSubscriberStatus {
  switch (stripeStatus) {
    case 'trialing':
      return 'trial';
    case 'active':
      return 'active';
    case 'canceled':
    case 'unpaid':
    case 'incomplete_expired':
      return 'cancelled';
    case 'past_due':
    case 'paused':
      return 'expired';
    default:
      return 'expired';
  }
}

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import logger from '../../config/logger';
import { trackFunnelEvent } from '../../services/botindex/funnel-tracker';

export type BotIndexApiPlan = 'free' | 'basic' | 'pro';

export interface ApiKeyLedgerEntry {
  email: string;
  stripeCustomerId?: string;
  walletAddress?: string;
  plan: BotIndexApiPlan;
  createdAt: string;
  lastUsed: string;
  requestCount: number;
  dailyLimit?: number; // if set, cap requests per UTC day
  dailyCount?: number;
  dailyCountDate?: string; // YYYY-MM-DD UTC
  status: 'active';
}

const API_KEY_DATA_DIR = process.env.API_KEY_DATA_DIR || '/data';
const API_KEY_DATA_FILE = path.join(API_KEY_DATA_DIR, 'api-keys.json');
const apiKeyLedger = new Map<string, ApiKeyLedgerEntry>();

let flushScheduled = false;

declare global {
  namespace Express {
    interface Request {
      apiKeyAuth?: {
        email: string;
        plan: BotIndexApiPlan;
        apiKey: string;
      };
    }
  }
}

function loadLedger(): void {
  try {
    if (!fs.existsSync(API_KEY_DATA_FILE)) return;

    const raw = fs.readFileSync(API_KEY_DATA_FILE, 'utf-8');
    const data = JSON.parse(raw) as Record<string, ApiKeyLedgerEntry>;
    for (const [apiKey, entry] of Object.entries(data)) {
      apiKeyLedger.set(apiKey, entry);
    }
    logger.info({ apiKeys: apiKeyLedger.size }, 'BotIndex API key ledger loaded');
  } catch (err) {
    logger.warn({ err }, 'Failed to load BotIndex API key ledger, starting fresh');
  }
}

async function flushLedger(): Promise<void> {
  try {
    await fs.promises.mkdir(API_KEY_DATA_DIR, { recursive: true });
    const data: Record<string, ApiKeyLedgerEntry> = {};
    for (const [apiKey, entry] of apiKeyLedger.entries()) {
      data[apiKey] = entry;
    }
    await fs.promises.writeFile(API_KEY_DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    logger.warn({ err }, 'Failed to flush BotIndex API key ledger');
  }
}

function scheduleLedgerFlush(): void {
  if (flushScheduled) return;
  flushScheduled = true;
  setTimeout(() => {
    flushScheduled = false;
    void flushLedger();
  }, 500);
}

function extractApiKey(req: Request): string | null {
  const header = req.header('x-api-key');
  if (!header) return null;
  const firstValue = header.split(',')[0]?.trim();
  return firstValue || null;
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function isDailyLimitExceeded(entry: ApiKeyLedgerEntry): boolean {
  if (!entry.dailyLimit) return false;
  const today = todayUTC();
  if (entry.dailyCountDate !== today) return false; // new day, not exceeded yet
  return (entry.dailyCount || 0) >= entry.dailyLimit;
}

function touchValidKey(apiKey: string, entry: ApiKeyLedgerEntry): void {
  entry.requestCount += 1;
  entry.lastUsed = new Date().toISOString();

  // Track daily count if dailyLimit is set
  if (entry.dailyLimit) {
    const today = todayUTC();
    if (entry.dailyCountDate !== today) {
      entry.dailyCount = 1;
      entry.dailyCountDate = today;
    } else {
      entry.dailyCount = (entry.dailyCount || 0) + 1;
    }
  }

  apiKeyLedger.set(apiKey, entry);
  scheduleLedgerFlush();
}

function resolveActiveEntry(apiKey: string): ApiKeyLedgerEntry | null {
  const entry = apiKeyLedger.get(apiKey);
  if (!entry) return null;
  if (entry.status !== 'active') return null;
  return entry;
}

function attachAuth(req: Request, apiKey: string, entry: ApiKeyLedgerEntry): void {
  req.apiKeyAuth = {
    apiKey,
    email: entry.email,
    plan: entry.plan,
  };

  trackFunnelEvent('first_auth_call', {
    apiKey,
    keyPrefix: apiKey.slice(0, 8),
    plan: entry.plan,
  });
}

export function generateApiKey(): string {
  let apiKey = `botindex_sk_${crypto.randomBytes(16).toString('hex')}`;
  while (apiKeyLedger.has(apiKey)) {
    apiKey = `botindex_sk_${crypto.randomBytes(16).toString('hex')}`;
  }
  return apiKey;
}

export function updateApiKeyWallet(apiKey: string, walletAddress: string): boolean {
  const entry = apiKeyLedger.get(apiKey);
  if (!entry) return false;
  entry.walletAddress = walletAddress.toLowerCase();
  scheduleLedgerFlush();
  return true;
}

export function createApiKeyEntry(params: {
  apiKey: string;
  email: string;
  stripeCustomerId?: string;
  walletAddress?: string;
  plan: BotIndexApiPlan;
}): ApiKeyLedgerEntry {
  const now = new Date().toISOString();
  const entry: ApiKeyLedgerEntry = {
    email: params.email,
    stripeCustomerId: params.stripeCustomerId,
    walletAddress: params.walletAddress?.toLowerCase(),
    plan: params.plan,
    createdAt: now,
    lastUsed: now,
    requestCount: 0,
    status: 'active',
  };
  apiKeyLedger.set(params.apiKey, entry);
  scheduleLedgerFlush();
  return entry;
}

export function getApiKeyEntry(apiKey: string): ApiKeyLedgerEntry | null {
  return apiKeyLedger.get(apiKey) || null;
}

export const requireApiKey: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = extractApiKey(req);
  if (!apiKey) {
    res.status(401).json({ error: 'invalid_api_key', message: 'Valid X-API-Key header is required.' });
    return;
  }

  const entry = resolveActiveEntry(apiKey);
  if (!entry) {
    res.status(401).json({ error: 'invalid_api_key', message: 'Valid X-API-Key header is required.' });
    return;
  }

  touchValidKey(apiKey, entry);
  attachAuth(req, apiKey, entry);
  next();
};

export const optionalApiKey: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = extractApiKey(req);
  if (!apiKey) {
    next();
    return;
  }

  const entry = resolveActiveEntry(apiKey);
  if (!entry) {
    next();
    return;
  }

  // Check daily limit BEFORE touching (so we don't count the rejected request)
  if (isDailyLimitExceeded(entry)) {
    // Add x402 payment-required header for agent auto-negotiation
    const { buildX402UpgradePayload } = require('./x402Gate');
    const requestUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const x402Upgrade = buildX402UpgradePayload(requestUrl);
    if (x402Upgrade) {
      res.setHeader('payment-required', x402Upgrade.header);
    }

    trackFunnelEvent('rate_limit_hit', {
      endpoint: req.path,
      ip: req.ip?.slice(-6),
      source: 'apiKeyAuth.dailyLimit',
      plan: entry.plan,
    });

    res.status(429).json({
      error: 'daily_limit_exceeded',
      message: `You've used all ${entry.dailyLimit} free requests for today. Upgrade to Pro for unlimited access, or pay per call with x402.`,
      upgrade: {
        pro: {
          url: 'https://api.botindex.dev/api/botindex/keys/register?plan=pro',
          price: '$29/mo',
          description: 'Unlimited API calls. Cancel anytime.',
          features: ['Unlimited requests', 'All 29 endpoints', 'Priority support', 'Webhook alerts'],
        },
        ...(x402Upgrade?.body || {}),
      },
      free_channels: {
        message: 'Get free delayed signals in our channels while you decide:',
        discord: 'https://discord.gg/polyhacks',
        telegram: {
          whales: 'https://t.me/polyhacks_whales',
          bot: 'https://t.me/polybettorbot?start=trial',
        },
      },
      resetAt: `${todayUTC()}T23:59:59Z`,
      used: entry.dailyCount,
      limit: entry.dailyLimit,
    });
    return;
  }

  touchValidKey(apiKey, entry);
  attachAuth(req, apiKey, entry);

  // Set usage headers on every response so users see remaining quota
  if (entry.dailyLimit) {
    const used = entry.dailyCount || 0;
    const remaining = Math.max(0, entry.dailyLimit - used);
    res.setHeader('X-BotIndex-Daily-Used', String(used));
    res.setHeader('X-BotIndex-Daily-Limit', String(entry.dailyLimit));
    res.setHeader('X-BotIndex-Daily-Remaining', String(remaining));
    if (remaining <= 1) {
      res.setHeader('X-BotIndex-Upgrade', 'https://api.botindex.dev/api/botindex/keys/register?plan=pro');
    }
  }

  next();
};

loadLedger();

// Backfill: ensure all free-tier keys have the 10/day limit
(function backfillFreeLimits() {
  let updated = 0;
  for (const [, entry] of apiKeyLedger.entries()) {
    if (entry.plan === 'free' && !entry.dailyLimit) {
      entry.dailyLimit = 3;
      updated++;
    }
  }
  if (updated > 0) {
    logger.info({ updated }, 'Backfilled free-tier API keys with 3 req/day limit');
    scheduleLedgerFlush();
  }
})();

export function getAllApiKeys(): { key: string; entry: ApiKeyLedgerEntry }[] {
  return Array.from(apiKeyLedger.entries()).map(([key, entry]) => ({
    key: `${key.slice(0, 16)}...`,
    entry,
  }));
}

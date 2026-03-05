import type { Request, RequestHandler, Response, NextFunction } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import logger from '../../config/logger';

const API_KEY_PREFIX = 'bi_live_';
const API_KEY_HEX_LENGTH = 32;
const DEFAULT_MONTHLY_LIMIT = 500;
const API_KEY_DATA_DIR = process.env.API_KEY_DATA_DIR || '/data';
const API_KEY_DATA_FILE = path.join(API_KEY_DATA_DIR, 'api-keys-ledger.json');
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ApiKeyTier = 'free';

interface ApiKeyLedgerEntry {
  apiKey: string;
  email: string;
  tier: ApiKeyTier;
  monthlyLimit: number;
  created: string;
  usageByMonth: Record<string, number>;
  lastSeen: string;
}

const ledgerByKey = new Map<string, ApiKeyLedgerEntry>();
const keyByEmail = new Map<string, string>();

function currentMonthKey(now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function nextResetAt(now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const nextMonth = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0));
  return nextMonth.toISOString();
}

function sanitizeEntry(entry: Partial<ApiKeyLedgerEntry>): ApiKeyLedgerEntry | null {
  if (typeof entry.apiKey !== 'string' || !entry.apiKey.startsWith(API_KEY_PREFIX)) {
    return null;
  }
  if (typeof entry.email !== 'string' || !EMAIL_REGEX.test(entry.email)) {
    return null;
  }

  const monthlyLimit =
    typeof entry.monthlyLimit === 'number' && Number.isFinite(entry.monthlyLimit) && entry.monthlyLimit > 0
      ? Math.floor(entry.monthlyLimit)
      : DEFAULT_MONTHLY_LIMIT;

  return {
    apiKey: entry.apiKey,
    email: entry.email.toLowerCase(),
    tier: 'free',
    monthlyLimit,
    created: typeof entry.created === 'string' ? entry.created : new Date().toISOString(),
    usageByMonth: entry.usageByMonth && typeof entry.usageByMonth === 'object' ? entry.usageByMonth : {},
    lastSeen: typeof entry.lastSeen === 'string' ? entry.lastSeen : new Date().toISOString(),
  };
}

function loadLedger(): void {
  try {
    if (!fs.existsSync(API_KEY_DATA_FILE)) return;

    const raw = fs.readFileSync(API_KEY_DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, Partial<ApiKeyLedgerEntry>>;

    for (const [apiKey, entry] of Object.entries(parsed)) {
      const sanitized = sanitizeEntry({ ...entry, apiKey });
      if (!sanitized) continue;

      ledgerByKey.set(apiKey, sanitized);
      keyByEmail.set(sanitized.email, apiKey);
    }

    logger.info({ keys: ledgerByKey.size }, 'API key ledger loaded');
  } catch (err) {
    logger.warn({ err }, 'Failed to load API key ledger, starting fresh');
  }
}

let flushPending = false;

function scheduleLedgerFlush(): void {
  if (flushPending) return;
  flushPending = true;

  setTimeout(() => {
    flushPending = false;

    try {
      if (!fs.existsSync(API_KEY_DATA_DIR)) {
        fs.mkdirSync(API_KEY_DATA_DIR, { recursive: true });
      }

      const data: Record<string, ApiKeyLedgerEntry> = {};
      for (const [apiKey, entry] of ledgerByKey.entries()) {
        data[apiKey] = entry;
      }

      fs.writeFileSync(API_KEY_DATA_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
      logger.warn({ err }, 'Failed to flush API key ledger');
    }
  }, 5000);
}

function generateApiKey(): string {
  while (true) {
    const candidate = `${API_KEY_PREFIX}${crypto.randomBytes(API_KEY_HEX_LENGTH / 2).toString('hex')}`;
    if (!ledgerByKey.has(candidate)) return candidate;
  }
}

function getMonthlyUsage(entry: ApiKeyLedgerEntry, now: Date = new Date()): number {
  const key = currentMonthKey(now);
  const current = entry.usageByMonth[key];
  return typeof current === 'number' && Number.isFinite(current) && current >= 0
    ? Math.floor(current)
    : 0;
}

function isManagementRoute(req: Request): boolean {
  return req.path === '/v1/keys/register' || req.path === '/v1/keys/info';
}

function normalizeApiKey(value: string | string[] | undefined): string | null {
  if (!value) return null;
  const key = Array.isArray(value) ? value[0] : value;
  if (!key) return null;
  return key.trim();
}

loadLedger();

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim().toLowerCase());
}

export function registerApiKey(email: string): {
  apiKey: string;
  email: string;
  tier: ApiKeyTier;
  monthlyLimit: number;
  created: string;
} {
  const normalizedEmail = email.trim().toLowerCase();
  const existingKey = keyByEmail.get(normalizedEmail);

  if (existingKey) {
    const existing = ledgerByKey.get(existingKey);
    if (existing) {
      return {
        apiKey: existing.apiKey,
        email: existing.email,
        tier: existing.tier,
        monthlyLimit: existing.monthlyLimit,
        created: existing.created,
      };
    }
  }

  const created = new Date().toISOString();
  const apiKey = generateApiKey();
  const entry: ApiKeyLedgerEntry = {
    apiKey,
    email: normalizedEmail,
    tier: 'free',
    monthlyLimit: DEFAULT_MONTHLY_LIMIT,
    created,
    usageByMonth: {},
    lastSeen: created,
  };

  ledgerByKey.set(apiKey, entry);
  keyByEmail.set(normalizedEmail, apiKey);
  scheduleLedgerFlush();

  return {
    apiKey: entry.apiKey,
    email: entry.email,
    tier: entry.tier,
    monthlyLimit: entry.monthlyLimit,
    created: entry.created,
  };
}

export function getApiKeyInfo(apiKey: string): {
  email: string;
  tier: ApiKeyTier;
  monthlyLimit: number;
  usedThisMonth: number;
  remaining: number;
  resetsAt: string;
} | null {
  const entry = ledgerByKey.get(apiKey.trim());
  if (!entry) return null;

  const usedThisMonth = getMonthlyUsage(entry);
  const remaining = Math.max(0, entry.monthlyLimit - usedThisMonth);

  return {
    email: entry.email,
    tier: entry.tier,
    monthlyLimit: entry.monthlyLimit,
    usedThisMonth,
    remaining,
    resetsAt: nextResetAt(),
  };
}

export function apiKeyAuth(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const apiKeyHeader = normalizeApiKey(req.headers['x-api-key']);
    if (!apiKeyHeader) {
      next();
      return;
    }

    const entry = ledgerByKey.get(apiKeyHeader);
    if (!entry) {
      next();
      return;
    }

    const usage = getMonthlyUsage(entry);
    const remainingBefore = Math.max(0, entry.monthlyLimit - usage);
    if (remainingBefore <= 0) {
      res.setHeader('X-BotIndex-Key-Remaining', '0');
      next();
      return;
    }

    if (!isManagementRoute(req)) {
      const month = currentMonthKey();
      entry.usageByMonth[month] = usage + 1;
      entry.lastSeen = new Date().toISOString();
      scheduleLedgerFlush();
    }

    const usedNow = getMonthlyUsage(entry);
    const remainingNow = Math.max(0, entry.monthlyLimit - usedNow);

    res.setHeader('X-BotIndex-Key-Remaining', String(remainingNow));
    (req as any).__apiKeyAuthenticated = true;
    next();
  };
}

export function skipIfApiKey(handler: RequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if ((req as any).__apiKeyAuthenticated) {
      next();
      return;
    }
    handler(req, res, next);
  };
}

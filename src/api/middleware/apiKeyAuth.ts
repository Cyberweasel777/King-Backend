import type { NextFunction, Request, RequestHandler, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import logger from '../../config/logger';

export type BotIndexApiPlan = 'free' | 'basic' | 'pro';

export interface ApiKeyLedgerEntry {
  email: string;
  stripeCustomerId?: string;
  plan: BotIndexApiPlan;
  createdAt: string;
  lastUsed: string;
  requestCount: number;
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

function touchValidKey(apiKey: string, entry: ApiKeyLedgerEntry): void {
  entry.requestCount += 1;
  entry.lastUsed = new Date().toISOString();
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
}

export function generateApiKey(): string {
  let apiKey = `botindex_sk_${crypto.randomBytes(16).toString('hex')}`;
  while (apiKeyLedger.has(apiKey)) {
    apiKey = `botindex_sk_${crypto.randomBytes(16).toString('hex')}`;
  }
  return apiKey;
}

export function createApiKeyEntry(params: {
  apiKey: string;
  email: string;
  stripeCustomerId?: string;
  plan: BotIndexApiPlan;
}): ApiKeyLedgerEntry {
  const now = new Date().toISOString();
  const entry: ApiKeyLedgerEntry = {
    email: params.email,
    stripeCustomerId: params.stripeCustomerId,
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

export const optionalApiKey: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
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

  touchValidKey(apiKey, entry);
  attachAuth(req, apiKey, entry);
  next();
};

loadLedger();

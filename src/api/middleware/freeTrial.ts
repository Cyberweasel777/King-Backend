import type { RequestHandler, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import logger from '../../config/logger';

/**
 * Wallet-based free trial for x402 endpoints.
 *
 * How it works:
 * - Extracts wallet address from x402 payment header OR X-Wallet header
 * - Hashes the wallet for privacy-preserving storage
 * - Grants FREE_TRIAL_LIMIT requests before requiring payment
 * - Returns X-BotIndex-Free-Remaining header on every response
 * - After limit exhausted, passes through to normal x402 gate
 *
 * No signup. No API keys. Wallet = identity = trial.
 */

const FREE_TRIAL_LIMIT = parseInt(process.env.FREE_TRIAL_LIMIT || '50', 10);
const TRIAL_DATA_DIR = process.env.TRIAL_DATA_DIR || '/data';
const TRIAL_DATA_FILE = path.join(TRIAL_DATA_DIR, 'free-trial-ledger.json');

// In-memory ledger: walletHash -> { count, firstSeen, lastSeen }
interface TrialEntry {
  count: number;
  firstSeen: string;
  lastSeen: string;
}

const ledger = new Map<string, TrialEntry>();

// Load persisted ledger on startup
function loadLedger(): void {
  try {
    if (fs.existsSync(TRIAL_DATA_FILE)) {
      const raw = fs.readFileSync(TRIAL_DATA_FILE, 'utf-8');
      const data = JSON.parse(raw) as Record<string, TrialEntry>;
      for (const [hash, entry] of Object.entries(data)) {
        ledger.set(hash, entry);
      }
      logger.info({ wallets: ledger.size }, 'Free trial ledger loaded');
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to load free trial ledger, starting fresh');
  }
}

// Async flush to disk (non-blocking)
let flushPending = false;
function scheduleLedgerFlush(): void {
  if (flushPending) return;
  flushPending = true;
  setTimeout(() => {
    flushPending = false;
    try {
      if (!fs.existsSync(TRIAL_DATA_DIR)) {
        fs.mkdirSync(TRIAL_DATA_DIR, { recursive: true });
      }
      const data: Record<string, TrialEntry> = {};
      for (const [hash, entry] of ledger.entries()) {
        data[hash] = entry;
      }
      fs.writeFileSync(TRIAL_DATA_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
      logger.warn({ err }, 'Failed to flush free trial ledger');
    }
  }, 5000);
}

loadLedger();

function hashWallet(address: string): string {
  return crypto.createHash('sha256').update(address.toLowerCase()).digest('hex').slice(0, 16);
}

/**
 * Extract wallet address from request.
 * Priority:
 * 1. X-Wallet header (explicit)
 * 2. x402 payment header (parsed)
 * 3. Query param ?wallet=0x...
 */
function extractWallet(req: Request): string | null {
  // Explicit header
  const xWallet = req.headers['x-wallet'] as string | undefined;
  if (xWallet && /^0x[a-fA-F0-9]{40}$/.test(xWallet)) {
    return xWallet;
  }

  // x402 payment header — the payment JSON contains sender wallet
  const paymentHeader = req.headers['x-payment'] as string | undefined;
  if (paymentHeader) {
    try {
      const parsed = JSON.parse(paymentHeader);
      const sender = parsed?.payload?.authorization?.from || parsed?.from;
      if (sender && /^0x[a-fA-F0-9]{40}$/.test(sender)) {
        return sender;
      }
    } catch {
      // Not valid JSON, ignore
    }
  }

  // Query param fallback
  const qWallet = req.query.wallet as string | undefined;
  if (qWallet && /^0x[a-fA-F0-9]{40}$/.test(qWallet)) {
    return qWallet;
  }

  return null;
}

export interface FreeTrialOptions {
  /** Override default limit per wallet (default: FREE_TRIAL_LIMIT env or 50) */
  limit?: number;
}

/**
 * Free trial middleware. Place BEFORE x402Gate in the middleware chain.
 * If wallet has remaining free requests, bypasses x402 and serves data.
 * If no wallet provided or trial exhausted, calls next() to hit x402Gate.
 */
export function freeTrialGate(options: FreeTrialOptions = {}): RequestHandler {
  const limit = options.limit ?? FREE_TRIAL_LIMIT;

  return (req: Request, res: Response, next: NextFunction) => {
    const wallet = extractWallet(req);

    if (!wallet) {
      // No wallet identified — can't track trial, pass to x402
      // But set header so agents know trial exists
      res.setHeader('X-BotIndex-Free-Trial', 'available');
      res.setHeader('X-BotIndex-Free-Trial-Limit', String(limit));
      res.setHeader('X-BotIndex-Free-Trial-How', 'Send X-Wallet: 0x... header to activate');
      next();
      return;
    }

    const walletHash = hashWallet(wallet);
    const now = new Date().toISOString();

    let entry = ledger.get(walletHash);
    if (!entry) {
      entry = { count: 0, firstSeen: now, lastSeen: now };
      ledger.set(walletHash, entry);
    }

    if (entry.count >= limit) {
      // Trial exhausted — pass to x402
      res.setHeader('X-BotIndex-Free-Remaining', '0');
      res.setHeader('X-BotIndex-Trial-Status', 'exhausted');
      next();
      return;
    }

    // Free request — increment counter and skip x402
    entry.count++;
    entry.lastSeen = now;
    scheduleLedgerFlush();

    const remaining = limit - entry.count;
    res.setHeader('X-BotIndex-Free-Remaining', String(remaining));
    res.setHeader('X-BotIndex-Trial-Status', 'active');
    res.setHeader('X-BotIndex-Wallet', walletHash);

    logger.info(
      { walletHash, count: entry.count, remaining, path: req.path },
      'Free trial request served'
    );

    // Mark request as trial-authenticated so x402 gate can be skipped
    (req as any).__freeTrialAuthenticated = true;
    next();
  };
}

/**
 * Conditional x402 gate that skips if free trial already authenticated.
 * Wrap your existing x402Gate with this.
 */
export function skipIfFreeTrial(x402Handler: RequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if ((req as any).__freeTrialAuthenticated) {
      next();
      return;
    }
    x402Handler(req, res, next);
  };
}

/** Get trial stats for admin/monitoring */
export function getTrialStats() {
  let totalWallets = 0;
  let totalRequests = 0;
  let exhaustedWallets = 0;
  const wallets: Array<{ hash: string; count: number; remaining: number; firstSeen: string; lastSeen: string }> = [];

  for (const [hash, entry] of ledger.entries()) {
    totalWallets++;
    totalRequests += entry.count;
    const remaining = Math.max(0, FREE_TRIAL_LIMIT - entry.count);
    if (remaining === 0) exhaustedWallets++;
    wallets.push({ hash, count: entry.count, remaining, firstSeen: entry.firstSeen, lastSeen: entry.lastSeen });
  }

  return {
    freeTrialLimit: FREE_TRIAL_LIMIT,
    totalWallets,
    totalRequests,
    exhaustedWallets,
    activeWallets: totalWallets - exhaustedWallets,
    wallets: wallets.sort((a, b) => b.count - a.count),
  };
}

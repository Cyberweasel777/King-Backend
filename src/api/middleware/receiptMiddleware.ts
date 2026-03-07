import type { NextFunction, Request, RequestHandler, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  createReceipt,
  generateKeyPair,
  hashInput,
  hashOutput,
  loadSecretKey,
  publicKeyFromSecret,
  signReceipt as signAarReceipt,
  verifyReceipt as verifyAarReceipt,
} from '@botindex/aar';
import type { AARReceipt, Cost, PrincipalType, UnsignedReceipt } from '@botindex/aar';
import logger from '../../config/logger';

const RECEIPT_HEADER = 'X-BotIndex-Receipt';
const RECEIPT_AGENT = 'botindex/v1';
const RECEIPT_SIGNING_KEY_PATH = process.env.RECEIPT_SIGNING_KEY || '/data/receipt-signing-key.pem';
const RECEIPTS_DATA_DIR = process.env.RECEIPTS_DATA_DIR || '/data/receipts';
const MAX_RECEIPTS = 10_000;
const FLUSH_DELAY_MS = 2_000;
const RECEIPT_KEY_BEGIN = '-----BEGIN BOTINDEX RECEIPT SIGNING KEY-----';
const RECEIPT_KEY_END = '-----END BOTINDEX RECEIPT SIGNING KEY-----';

interface SigningKeyState {
  secretKey: Uint8Array;
  publicKey: Uint8Array;
}

export interface AgentActionReceipt {
  receiptId: string;
  agent: string;
  principal: string;
  action: string;
  scope: string;
  inputHash: string;
  outputHash: string;
  timestamp: string;
  cost: string | number | null;
  signature: string;
}

interface UnsignedAgentActionReceipt {
  receiptId: string;
  agent: string;
  principal: string;
  action: string;
  scope: string;
  inputHash: string;
  outputHash: string;
  timestamp: string;
  cost: string | number | null;
}

export interface ReceiptQueryOptions {
  principal?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export const TRUST_LAYER_JSON = {
  name: 'BotIndex Trust Layer',
  version: '1.0',
  capabilities: {
    receipts: {
      enabled: true,
      signing: 'Ed25519',
      format: 'JSON',
      header: 'X-BotIndex-Receipt',
      lookup: '/api/botindex/receipts/{receiptId}',
      export: '/api/botindex/receipts/export',
      pubkey: '/api/botindex/.well-known/receipt-pubkey',
    },
    provenance: {
      inputHashing: 'SHA-256',
      outputHashing: 'SHA-256',
      timestampSource: 'server-utc',
    },
  },
  spec: 'https://github.com/Cyberweasel777/agent-action-receipt-spec',
};

const receiptStore = new Map<string, AgentActionReceipt>();
const pendingFlush: AgentActionReceipt[] = [];

let signingKeyState: SigningKeyState | null = null;
let signingInitPromise: Promise<void> | null = null;
let flushTimer: NodeJS.Timeout | null = null;
let flushInProgress = false;

function sha256Hex(value: string | Buffer): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function ensureSigningState(): SigningKeyState {
  if (!signingKeyState) {
    throw new Error('Receipt signing key is not initialized');
  }
  return signingKeyState;
}

function parseSigningKeyFile(raw: string): Uint8Array | null {
  if (!raw.trim()) {
    return null;
  }

  try {
    return loadSecretKey(raw);
  } catch {
    return null;
  }
}

function toSigningKeyPem(secretKey: Uint8Array): string {
  const encoded = Buffer.from(secretKey).toString('base64');
  const wrapped = encoded.match(/.{1,64}/g)?.join('\n') || encoded;
  return `${RECEIPT_KEY_BEGIN}\n${wrapped}\n${RECEIPT_KEY_END}\n`;
}

export async function initReceiptSigning(): Promise<void> {
  if (signingKeyState) return;
  if (signingInitPromise) return signingInitPromise;

  signingInitPromise = (async () => {
    try {
      if (fs.existsSync(RECEIPT_SIGNING_KEY_PATH)) {
        const raw = await fs.promises.readFile(RECEIPT_SIGNING_KEY_PATH, 'utf-8');
        const secret = parseSigningKeyFile(raw);
        if (!secret) {
          throw new Error('Invalid receipt signing key file');
        }
        signingKeyState = {
          secretKey: secret,
          publicKey: publicKeyFromSecret(secret),
        };
        logger.info({ path: RECEIPT_SIGNING_KEY_PATH }, 'Receipt signing key loaded');
        return;
      }

      const keyPair = generateKeyPair();
      await fs.promises.mkdir(path.dirname(RECEIPT_SIGNING_KEY_PATH), { recursive: true });
      await fs.promises.writeFile(RECEIPT_SIGNING_KEY_PATH, toSigningKeyPem(keyPair.secretKey), {
        mode: 0o600,
      });

      signingKeyState = {
        secretKey: keyPair.secretKey,
        publicKey: keyPair.publicKey,
      };
      logger.info({ path: RECEIPT_SIGNING_KEY_PATH }, 'Receipt signing key generated');
    } catch (err) {
      logger.error({ err, path: RECEIPT_SIGNING_KEY_PATH }, 'Failed to initialize receipt signing key');
      throw err;
    }
  })().finally(() => {
    signingInitPromise = null;
  });

  return signingInitPromise;
}

function resolvePrincipalType(principal: string): PrincipalType {
  if (principal === 'anonymous') return 'other';
  if (/^[a-f0-9]{64}$/i.test(principal)) return 'service';
  return 'user';
}

function parseAction(action: string): { method: string; target: string } {
  const [method, ...parts] = action.split(' ');
  const target = parts.join(' ').trim() || '/api/botindex';
  return {
    method: method ? method.toUpperCase() : 'GET',
    target,
  };
}

function normalizeCost(cost: string | number | null): Cost {
  return {
    amount: cost === null ? '0' : String(cost),
    currency: 'USD',
    unit: 'request',
  };
}

function toUnsignedAarReceipt(receipt: UnsignedAgentActionReceipt): UnsignedReceipt {
  const parsedAction = parseAction(receipt.action);
  return createReceipt({
    receiptId: receipt.receiptId,
    timestamp: receipt.timestamp,
    agent: { id: receipt.agent },
    principal: {
      id: receipt.principal,
      type: resolvePrincipalType(receipt.principal),
    },
    action: {
      type: 'http.request',
      target: parsedAction.target,
      method: parsedAction.method,
      status: 'success',
    },
    scope: {
      permissions: [receipt.scope],
    },
    inputHash: { alg: 'sha256', digest: receipt.inputHash },
    outputHash: { alg: 'sha256', digest: receipt.outputHash },
    cost: normalizeCost(receipt.cost),
    metadata: {
      botindex: {
        action: receipt.action,
        scope: receipt.scope,
        legacyCost: receipt.cost,
      },
    },
    signature: {
      kid: `${receipt.agent}#key-1`,
    },
  });
}

export function toAARReceipt(receipt: AgentActionReceipt): AARReceipt {
  const unsigned = toUnsignedAarReceipt(receipt);
  return {
    ...unsigned,
    signature: {
      ...unsigned.signature,
      sig: receipt.signature,
    },
  };
}

function signReceipt(receipt: UnsignedAgentActionReceipt): string {
  const { secretKey, publicKey } = ensureSigningState();
  const signed = signAarReceipt(toUnsignedAarReceipt(receipt), secretKey);
  const verified = verifyAarReceipt(signed, publicKey);
  if (!verified.ok) {
    throw new Error(verified.reason || 'receipt signature verification failed');
  }
  return signed.signature.sig;
}

function normalizeApiKeyHash(apiKey: string): string {
  return sha256Hex(apiKey.trim());
}

function resolvePrincipal(req: Request): string {
  const wallet = req.header('x-wallet')?.trim();
  if (wallet) return wallet;

  const apiKey = req.apiKeyAuth?.apiKey || req.header('x-api-key')?.split(',')[0]?.trim();
  if (apiKey) return normalizeApiKeyHash(apiKey);

  return 'anonymous';
}

function extractScalarCost(value: unknown): string | number | null {
  if (typeof value === 'number' || typeof value === 'string') return value;
  return null;
}

function extractCostFromObject(value: unknown): string | number | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const obj = value as Record<string, unknown>;
  const keys = ['cost', 'amount', 'price', 'value'];

  for (const key of keys) {
    const direct = extractScalarCost(obj[key]);
    if (direct !== null) {
      return direct;
    }

    const nested = extractCostFromObject(obj[key]);
    if (nested !== null) {
      return nested;
    }
  }

  for (const candidate of Object.values(obj)) {
    const nested = extractCostFromObject(candidate);
    if (nested !== null) {
      return nested;
    }
  }

  return null;
}

function resolveCost(req: Request): string | number | null {
  const paymentHeader = req.header('x-payment');
  if (!paymentHeader) return null;

  try {
    const parsed = JSON.parse(paymentHeader) as unknown;
    return extractCostFromObject(parsed);
  } catch {
    return null;
  }
}

function normalizeActionPath(req: Request): string {
  const originalPath = req.originalUrl.split('?')[0];
  return originalPath || '/api/botindex';
}

function deriveScope(actionPath: string): string {
  const normalized = actionPath.replace(/^\/api\/botindex/, '') || '/';

  if (normalized.startsWith('/receipts')) return 'receipts';
  if (normalized.startsWith('/.well-known') || normalized === '/trust') return 'trust';
  if (normalized.startsWith('/sports') || normalized.startsWith('/v1/sports')) return 'sports';
  if (normalized.startsWith('/crypto') || normalized.startsWith('/v1/crypto')) return 'crypto';
  if (normalized.startsWith('/commerce') || normalized.startsWith('/v1/commerce')) return 'commerce';
  if (
    normalized.startsWith('/genesis') ||
    normalized.startsWith('/solana') ||
    normalized.startsWith('/v1/solana')
  ) {
    return 'genesis';
  }
  if (normalized.startsWith('/signals') || normalized.startsWith('/v1/signals')) return 'signals';
  if (normalized.startsWith('/zora')) return 'zora';
  if (normalized.startsWith('/hyperliquid')) return 'hyperliquid';
  if (normalized.startsWith('/x402') || normalized.startsWith('/v1')) return 'x402';
  if (normalized.startsWith('/keys')) return 'keys';

  return 'general';
}

function clampLimit(limit: number | undefined): number {
  if (!limit || Number.isNaN(limit)) return 100;
  return Math.max(1, Math.min(limit, 100));
}

function addReceiptToMemory(receipt: AgentActionReceipt, persistToDisk = true): void {
  if (receiptStore.has(receipt.receiptId)) {
    receiptStore.delete(receipt.receiptId);
  }
  receiptStore.set(receipt.receiptId, receipt);

  while (receiptStore.size > MAX_RECEIPTS) {
    const oldestKey = receiptStore.keys().next().value as string | undefined;
    if (!oldestKey) break;
    receiptStore.delete(oldestKey);
  }

  if (!persistToDisk) return;

  pendingFlush.push(receipt);
  scheduleReceiptFlush();
}

function scheduleReceiptFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushPendingReceipts();
  }, FLUSH_DELAY_MS);
}

async function flushPendingReceipts(): Promise<void> {
  if (flushInProgress) return;
  if (pendingFlush.length === 0) return;

  flushInProgress = true;
  const batch = pendingFlush.splice(0, pendingFlush.length);

  try {
    await fs.promises.mkdir(RECEIPTS_DATA_DIR, { recursive: true });
    const byDay = new Map<string, string[]>();

    for (const receipt of batch) {
      const day = receipt.timestamp.slice(0, 10);
      const lines = byDay.get(day) || [];
      lines.push(JSON.stringify(receipt));
      byDay.set(day, lines);
    }

    for (const [day, lines] of byDay.entries()) {
      const file = path.join(RECEIPTS_DATA_DIR, `${day}.jsonl`);
      await fs.promises.appendFile(file, `${lines.join('\n')}\n`, 'utf-8');
    }
  } catch (err) {
    pendingFlush.unshift(...batch);
    logger.warn({ err }, 'Failed to flush BotIndex receipts');
  } finally {
    flushInProgress = false;
    if (pendingFlush.length > 0) {
      scheduleReceiptFlush();
    }
  }
}

function flushPendingReceiptsSync(): void {
  if (pendingFlush.length === 0) return;

  try {
    if (!fs.existsSync(RECEIPTS_DATA_DIR)) {
      fs.mkdirSync(RECEIPTS_DATA_DIR, { recursive: true });
    }

    const byDay = new Map<string, string[]>();
    for (const receipt of pendingFlush.splice(0, pendingFlush.length)) {
      const day = receipt.timestamp.slice(0, 10);
      const lines = byDay.get(day) || [];
      lines.push(JSON.stringify(receipt));
      byDay.set(day, lines);
    }

    for (const [day, lines] of byDay.entries()) {
      const file = path.join(RECEIPTS_DATA_DIR, `${day}.jsonl`);
      fs.appendFileSync(file, `${lines.join('\n')}\n`, 'utf-8');
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to synchronously flush BotIndex receipts');
  }
}

process.on('SIGTERM', flushPendingReceiptsSync);
process.on('SIGINT', flushPendingReceiptsSync);

function parseReceiptDate(value: string | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function isReceiptInRange(
  receipt: AgentActionReceipt,
  principal: string | undefined,
  fromMs: number | null,
  toMs: number | null
): boolean {
  if (principal && receipt.principal !== principal) {
    return false;
  }

  const ts = Date.parse(receipt.timestamp);
  if (!Number.isFinite(ts)) return false;
  if (fromMs !== null && ts < fromMs) return false;
  if (toMs !== null && ts > toMs) return false;
  return true;
}

function parseReceiptLine(line: string): AgentActionReceipt | null {
  if (!line.trim()) return null;
  try {
    const parsed = JSON.parse(line) as Partial<AgentActionReceipt>;
    if (
      typeof parsed.receiptId !== 'string' ||
      typeof parsed.agent !== 'string' ||
      typeof parsed.principal !== 'string' ||
      typeof parsed.action !== 'string' ||
      typeof parsed.scope !== 'string' ||
      typeof parsed.inputHash !== 'string' ||
      typeof parsed.outputHash !== 'string' ||
      typeof parsed.timestamp !== 'string' ||
      typeof parsed.signature !== 'string'
    ) {
      return null;
    }

    const cost =
      typeof parsed.cost === 'string' || typeof parsed.cost === 'number' || parsed.cost === null
        ? parsed.cost
        : null;

    return {
      receiptId: parsed.receiptId,
      agent: parsed.agent,
      principal: parsed.principal,
      action: parsed.action,
      scope: parsed.scope,
      inputHash: parsed.inputHash,
      outputHash: parsed.outputHash,
      timestamp: parsed.timestamp,
      cost,
      signature: parsed.signature,
    };
  } catch {
    return null;
  }
}

async function listReceiptFiles(): Promise<string[]> {
  try {
    const entries = await fs.promises.readdir(RECEIPTS_DATA_DIR, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
      .map((entry) => path.join(RECEIPTS_DATA_DIR, entry.name))
      .sort()
      .reverse();
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === 'ENOENT') return [];
    throw err;
  }
}

async function loadReceiptsFromDisk(fromMs: number | null, toMs: number | null): Promise<AgentActionReceipt[]> {
  const files = await listReceiptFiles();
  if (files.length === 0) return [];

  const fromDay = fromMs !== null ? new Date(fromMs).toISOString().slice(0, 10) : null;
  const toDay = toMs !== null ? new Date(toMs).toISOString().slice(0, 10) : null;

  const output: AgentActionReceipt[] = [];

  for (const file of files) {
    const base = path.basename(file, '.jsonl');
    if (fromDay && base < fromDay) continue;
    if (toDay && base > toDay) continue;

    try {
      const raw = await fs.promises.readFile(file, 'utf-8');
      for (const line of raw.split('\n')) {
        const parsed = parseReceiptLine(line);
        if (parsed) {
          output.push(parsed);
        }
      }
    } catch (err) {
      logger.warn({ err, file }, 'Failed to parse receipt file');
    }
  }

  return output;
}

export function getReceiptPublicKeyBase64(): string {
  const { publicKey } = ensureSigningState();
  return Buffer.from(publicKey).toString('base64');
}

export function getReceiptSigningSecretKey(): Uint8Array {
  const { secretKey } = ensureSigningState();
  return secretKey;
}

export function getReceiptByIdFromMemory(receiptId: string): AgentActionReceipt | null {
  const found = receiptStore.get(receiptId);
  if (!found) return null;
  receiptStore.delete(receiptId);
  receiptStore.set(receiptId, found);
  return found;
}

export async function findReceiptById(receiptId: string): Promise<AgentActionReceipt | null> {
  const inMemory = getReceiptByIdFromMemory(receiptId);
  if (inMemory) return inMemory;

  const files = await listReceiptFiles();
  for (const file of files) {
    try {
      const raw = await fs.promises.readFile(file, 'utf-8');
      const lines = raw.split('\n');
      for (let idx = lines.length - 1; idx >= 0; idx -= 1) {
        const parsed = parseReceiptLine(lines[idx] || '');
        if (parsed && parsed.receiptId === receiptId) {
          addReceiptToMemory(parsed, false);
          return parsed;
        }
      }
    } catch (err) {
      logger.warn({ err, file }, 'Failed searching receipt file by ID');
    }
  }

  return null;
}

export async function queryReceipts(options: ReceiptQueryOptions): Promise<AgentActionReceipt[]> {
  const fromMs = parseReceiptDate(options.from);
  const toMs = parseReceiptDate(options.to);
  const limit = clampLimit(options.limit);
  const principal = options.principal?.trim() || undefined;

  const merged = new Map<string, AgentActionReceipt>();

  for (const receipt of receiptStore.values()) {
    if (!isReceiptInRange(receipt, principal, fromMs, toMs)) continue;
    merged.set(receipt.receiptId, receipt);
  }

  const diskReceipts = await loadReceiptsFromDisk(fromMs, toMs);
  for (const receipt of diskReceipts) {
    if (!isReceiptInRange(receipt, principal, fromMs, toMs)) continue;
    if (!merged.has(receipt.receiptId)) {
      merged.set(receipt.receiptId, receipt);
    }
  }

  return Array.from(merged.values())
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
    .slice(0, limit);
}

function safeBufferFromChunk(chunk: unknown, encoding?: BufferEncoding): Buffer | null {
  if (chunk === undefined || chunk === null) return null;
  if (Buffer.isBuffer(chunk)) return chunk;
  if (chunk instanceof Uint8Array) return Buffer.from(chunk);
  if (typeof chunk === 'string') return Buffer.from(chunk, encoding);
  return Buffer.from(String(chunk), encoding);
}

function createUnsignedReceipt(req: Request, outputHash: string): UnsignedAgentActionReceipt {
  const actionPath = normalizeActionPath(req);
  return {
    receiptId: crypto.randomUUID(),
    agent: RECEIPT_AGENT,
    principal: resolvePrincipal(req),
    action: `${req.method.toUpperCase()} ${actionPath}`,
    scope: deriveScope(actionPath),
    inputHash: hashInput({ query: req.query, body: req.body }).digest,
    outputHash,
    timestamp: new Date().toISOString(),
    cost: resolveCost(req),
  };
}

export const receiptMiddleware: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const chunks: Buffer[] = [];
  let finalized = false;

  const originalWrite = res.write.bind(res);
  const originalEnd = res.end.bind(res);

  const finalizeReceipt = () => {
    if (finalized) return;
    finalized = true;

    try {
      const outputBody = chunks.length > 0 ? Buffer.concat(chunks) : Buffer.alloc(0);
      const outputHash = hashOutput(outputBody).digest;
      const unsignedReceipt = createUnsignedReceipt(req, outputHash);
      const receipt: AgentActionReceipt = {
        ...unsignedReceipt,
        signature: signReceipt(unsignedReceipt),
      };

      if (!res.headersSent) {
        const encoded = Buffer.from(JSON.stringify(receipt), 'utf-8').toString('base64');
        res.setHeader(RECEIPT_HEADER, encoded);
      }

      addReceiptToMemory(receipt);
    } catch (err) {
      logger.warn({ err, path: req.path }, 'Failed to generate BotIndex receipt');
    }
  };

  res.write = ((chunk: unknown, encoding?: unknown, cb?: unknown) => {
    let resolvedEncoding: BufferEncoding | undefined;
    let resolvedCallback: ((error: Error | null | undefined) => void) | undefined;

    if (typeof encoding === 'string') {
      resolvedEncoding = encoding as BufferEncoding;
      if (typeof cb === 'function') {
        resolvedCallback = cb as (error: Error | null | undefined) => void;
      }
    } else if (typeof encoding === 'function') {
      resolvedCallback = encoding as (error: Error | null | undefined) => void;
    }

    const buffer = safeBufferFromChunk(chunk, resolvedEncoding);
    if (buffer) {
      chunks.push(buffer);
    }

    return originalWrite(chunk as any, resolvedEncoding as any, resolvedCallback as any);
  }) as typeof res.write;

  res.end = ((chunk?: unknown, encoding?: unknown, cb?: unknown) => {
    let resolvedChunk = chunk;
    let resolvedEncoding: BufferEncoding | undefined;
    let resolvedCallback: (() => void) | undefined;

    if (typeof chunk === 'function') {
      resolvedChunk = undefined;
      resolvedCallback = chunk as () => void;
    } else if (typeof encoding === 'string') {
      resolvedEncoding = encoding as BufferEncoding;
      if (typeof cb === 'function') {
        resolvedCallback = cb as () => void;
      }
    } else if (typeof encoding === 'function') {
      resolvedCallback = encoding as () => void;
    }

    const buffer = safeBufferFromChunk(resolvedChunk, resolvedEncoding);
    if (buffer) {
      chunks.push(buffer);
    }
    finalizeReceipt();
    return originalEnd(resolvedChunk as any, resolvedEncoding as any, resolvedCallback as any);
  }) as typeof res.end;

  next();
};

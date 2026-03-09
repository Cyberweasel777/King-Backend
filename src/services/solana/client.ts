import crypto from 'crypto';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import logger from '../../config/logger';
import type {
  SolanaAnchorMeta,
  SolanaAnchorRequest,
  SolanaAnchorResult,
  SolanaConfig,
  SolanaRegistryQuery,
  SolanaRegistryResult,
  SolanaVerifyResult,
} from './types';

type CanonicalValue =
  | null
  | string
  | number
  | boolean
  | CanonicalValue[]
  | { [key: string]: CanonicalValue };

interface ProofInputs {
  receiptHash: string;
  authorizedKeysHash: string;
  timestampWindowHash: string;
  proofInputHash: string;
  proofHash: string;
}

const DEFAULT_RPC_URL =
  process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 300;
const STUB_SLOT_BASE = 320_000_000;
const MEMO_PROGRAM_ID = new PublicKey(
  'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'
);
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

function parseInteger(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Solana ${label} timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function toCanonicalValue(input: unknown): CanonicalValue | undefined {
  if (input === undefined) return undefined;
  if (input === null) return null;

  if (typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean') {
    return input;
  }

  if (typeof input === 'bigint') {
    return input.toString();
  }

  if (Buffer.isBuffer(input)) {
    return input.toString('base64');
  }

  if (input instanceof Uint8Array) {
    return Buffer.from(input).toString('base64');
  }

  if (input instanceof Date) {
    return input.toISOString();
  }

  if (Array.isArray(input)) {
    const arr: CanonicalValue[] = [];
    for (const item of input) {
      const normalized = toCanonicalValue(item);
      if (normalized !== undefined) {
        arr.push(normalized);
      }
    }
    return arr;
  }

  if (typeof input === 'object') {
    const out: { [key: string]: CanonicalValue } = {};
    const obj = input as Record<string, unknown>;
    for (const key of Object.keys(obj).sort()) {
      const normalized = toCanonicalValue(obj[key]);
      if (normalized !== undefined) {
        out[key] = normalized;
      }
    }
    return out;
  }

  return String(input);
}

export function canonicalStringify(value: unknown): string {
  const normalized = toCanonicalValue(value);
  return JSON.stringify(normalized ?? null);
}

export function sha256Hex(value: string | Buffer): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizeAuthorizedKeys(keys: string[]): string[] {
  const normalized = keys
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return Array.from(new Set(normalized)).sort((a, b) => a.localeCompare(b));
}

function parseWindowBound(value: string | number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  if (typeof value === 'string') {
    const asNumber = Number.parseFloat(value);
    if (Number.isFinite(asNumber)) return asNumber;

    const asDate = Date.parse(value);
    if (Number.isFinite(asDate)) return asDate;
  }

  throw new Error('timestampWindow bounds must be valid numbers or ISO timestamps');
}

function normalizeHex32(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  const normalized = trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed;
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    return null;
  }
  return `0x${normalized}`;
}

function normalizeSignature(value: string): string | null {
  const trimmed = value.trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{43,128}$/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function coerceSlot(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  return null;
}

function base58Encode(bytes: Uint8Array): string {
  if (bytes.length === 0) return '';

  const digits: number[] = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i += 1) {
      const value = digits[i] * 256 + carry;
      digits[i] = value % 58;
      carry = Math.floor(value / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }

  let leadingZeros = 0;
  for (const byte of bytes) {
    if (byte === 0) {
      leadingZeros += 1;
    } else {
      break;
    }
  }

  let result = '';
  for (let i = 0; i < leadingZeros; i += 1) {
    result += BASE58_ALPHABET[0];
  }
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    result += BASE58_ALPHABET[digits[i]];
  }
  return result;
}

function parseSecretKey(raw: string): Uint8Array | null {
  const trimmed = raw.trim();

  if (!trimmed) return null;

  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (!Array.isArray(parsed)) return null;
      const numbers = parsed.map((value) => Number(value));
      if (numbers.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
        return null;
      }
      return Uint8Array.from(numbers);
    } catch {
      return null;
    }
  }

  if (/^(0x)?[a-fA-F0-9]+$/.test(trimmed) && trimmed.replace(/^0x/, '').length % 2 === 0) {
    const hex = trimmed.replace(/^0x/, '');
    return Uint8Array.from(Buffer.from(hex, 'hex'));
  }

  if (/^[A-Za-z0-9+/]+=*$/.test(trimmed)) {
    try {
      const decoded = Buffer.from(trimmed, 'base64');
      if (decoded.length > 0) {
        return Uint8Array.from(decoded);
      }
    } catch {
      // Ignore invalid base64 and continue.
    }
  }

  if (trimmed.includes(',')) {
    const parts = trimmed.split(',').map((part) => Number(part.trim()));
    if (parts.length > 0 && parts.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)) {
      return Uint8Array.from(parts);
    }
  }

  return null;
}

export function normalizeProofHash(value: string): string | null {
  return normalizeHex32(value);
}

export function buildProofInputs(request: SolanaAnchorRequest): ProofInputs {
  const canonicalReceipt = canonicalStringify(request.receipt);
  const receiptHash = sha256Hex(canonicalReceipt);

  const authorizedKeys = normalizeAuthorizedKeys(request.authorizedKeys);
  const authorizedKeysCanonical = canonicalStringify(authorizedKeys);
  const authorizedKeysHash = sha256Hex(authorizedKeysCanonical);

  const min = parseWindowBound(request.timestampWindow.min);
  const max = parseWindowBound(request.timestampWindow.max);
  if (max < min) {
    throw new Error('timestampWindow.max must be greater than or equal to timestampWindow.min');
  }

  const timestampWindowCanonical = canonicalStringify({ min, max });
  const timestampWindowHash = sha256Hex(timestampWindowCanonical);

  const proofInputCanonical = canonicalStringify({
    receiptHash,
    authorizedKeysHash,
    timestampWindowHash,
  });
  const proofInputHash = sha256Hex(proofInputCanonical);
  const proofHash = sha256Hex(`solana:aar:${proofInputHash}`);

  return {
    receiptHash,
    authorizedKeysHash,
    timestampWindowHash,
    proofInputHash,
    proofHash,
  };
}

function toAnchorMeta(value: unknown): SolanaAnchorMeta | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;

  const proofHash = typeof row.proofHash === 'string' ? normalizeHex32(row.proofHash) : null;
  const txSignature =
    typeof row.txSignature === 'string' ? normalizeSignature(row.txSignature) : null;
  const slot = coerceSlot(row.slot ?? row.solanaSlot);
  const timestamp = typeof row.timestamp === 'string' ? row.timestamp : null;
  const anchorId = typeof row.anchorId === 'string' ? row.anchorId : null;

  if (!proofHash || !txSignature || slot === null || !timestamp || !anchorId) {
    return null;
  }

  return {
    proofHash,
    txSignature,
    slot,
    timestamp,
    anchorId,
  };
}

export class SolanaClient {
  private readonly config: SolanaConfig;
  private readonly anchors = new Map<string, SolanaAnchorMeta>();
  private readonly connection: Connection;
  private payer: Keypair | null = null;

  constructor(config: Partial<SolanaConfig> = {}) {
    this.config = {
      rpcUrl: config.rpcUrl || DEFAULT_RPC_URL,
      live:
        typeof config.live === 'boolean'
          ? config.live
          : parseBoolean(process.env.SOLANA_ANCHOR_LIVE, false),
      timeoutMs:
        config.timeoutMs ??
        parseInteger(process.env.SOLANA_ANCHOR_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 1_000, 120_000),
      maxRetries:
        config.maxRetries ??
        parseInteger(process.env.SOLANA_ANCHOR_MAX_RETRIES, DEFAULT_MAX_RETRIES, 0, 8),
      retryDelayMs:
        config.retryDelayMs ??
        parseInteger(process.env.SOLANA_ANCHOR_RETRY_DELAY_MS, DEFAULT_RETRY_DELAY_MS, 50, 10_000),
    };

    this.connection = new Connection(this.config.rpcUrl, 'confirmed');
  }

  isLiveMode(): boolean {
    return this.config.live;
  }

  getConfig(): SolanaConfig {
    return { ...this.config };
  }

  async anchorProof(request: SolanaAnchorRequest): Promise<SolanaAnchorResult> {
    const proofInputs = buildProofInputs(request);
    const proofHash = `0x${proofInputs.proofHash}`;
    const timestamp = new Date().toISOString();

    if (!this.config.live) {
      const simulated = this.buildSimulatedAnchor(proofHash, timestamp);
      this.anchors.set(proofHash, {
        proofHash,
        txSignature: simulated.txSignature,
        slot: simulated.solanaSlot,
        timestamp: simulated.timestamp,
        anchorId: simulated.anchorId,
      });

      return {
        ...simulated,
        proofHash,
        receiptHash: proofInputs.receiptHash,
        authorizedKeysHash: proofInputs.authorizedKeysHash,
        timestampWindowHash: proofInputs.timestampWindowHash,
        proofInputHash: proofInputs.proofInputHash,
      };
    }

    const onChain = await this.callWithRetry('anchorProof', async () =>
      this.submitMemoTransaction(proofHash)
    );

    const result: SolanaAnchorResult = {
      proofHash,
      txSignature: onChain.txSignature,
      solanaSlot: onChain.solanaSlot,
      anchorId: `solana-anchor-${sha256Hex(`${proofHash}:anchor`).slice(0, 16)}`,
      timestamp,
      receiptHash: proofInputs.receiptHash,
      authorizedKeysHash: proofInputs.authorizedKeysHash,
      timestampWindowHash: proofInputs.timestampWindowHash,
      proofInputHash: proofInputs.proofInputHash,
    };

    this.anchors.set(proofHash, {
      proofHash: result.proofHash,
      txSignature: result.txSignature,
      slot: result.solanaSlot,
      timestamp: result.timestamp,
      anchorId: result.anchorId,
    });

    return result;
  }

  async verifyProof(
    proofHash: string,
    options: { queryChain?: boolean } = {}
  ): Promise<SolanaVerifyResult> {
    const normalized = normalizeProofHash(proofHash);
    if (!normalized) {
      throw new Error('Invalid proof hash');
    }

    const anchor = this.anchors.get(normalized);
    if (!anchor) {
      return { verified: false, anchorMeta: null };
    }

    if (this.config.live && options.queryChain !== false) {
      const confirmed = await this.callWithRetry('verifyProof', async () =>
        this.isSignatureConfirmed(anchor.txSignature)
      );
      if (!confirmed) {
        return { verified: false, anchorMeta: null };
      }
    }

    return {
      verified: true,
      anchorMeta: {
        slot: anchor.slot,
        timestamp: anchor.timestamp,
        anchorId: anchor.anchorId,
      },
    };
  }

  async getAnchors(query: SolanaRegistryQuery): Promise<SolanaRegistryResult> {
    const limit = Math.max(1, Math.min(200, query.limit));
    const offset = Math.max(0, query.offset);

    let anchors = Array.from(this.anchors.values()).sort(
      (a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)
    );

    if (query.since) {
      const sinceMs = Date.parse(query.since);
      if (Number.isFinite(sinceMs)) {
        anchors = anchors.filter((anchor) => Date.parse(anchor.timestamp) >= sinceMs);
      }
    }

    const total = anchors.length;
    const paginated = anchors.slice(offset, offset + limit);
    return {
      total,
      anchors: paginated,
      hasMore: offset + limit < total,
    };
  }

  private buildSimulatedAnchor(
    proofHash: string,
    timestamp: string
  ): Pick<SolanaAnchorResult, 'txSignature' | 'solanaSlot' | 'anchorId' | 'timestamp'> {
    return {
      txSignature: this.deriveStubSignature(proofHash, timestamp),
      solanaSlot: this.deriveStubSlot(proofHash),
      anchorId: `solana-anchor-${sha256Hex(`${proofHash}:anchor`).slice(0, 16)}`,
      timestamp,
    };
  }

  private deriveStubSignature(proofHash: string, timestamp: string): string {
    const partA = Buffer.from(sha256Hex(`${proofHash}:sig:${timestamp}`), 'hex');
    const partB = Buffer.from(sha256Hex(`${timestamp}:sig:${proofHash}`), 'hex');
    return base58Encode(Buffer.concat([partA, partB]));
  }

  private deriveStubSlot(proofHash: string): number {
    const offset = Number.parseInt(sha256Hex(`${proofHash}:slot`).slice(0, 8), 16);
    return STUB_SLOT_BASE + (offset % 20_000_000);
  }

  private async callWithRetry<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (attempt >= this.config.maxRetries) {
          break;
        }

        const delayMs = this.config.retryDelayMs * (2 ** attempt);
        logger.warn(
          { err: error, operation, attempt: attempt + 1, delayMs },
          'Solana operation failed, retrying'
        );
        await delay(delayMs);
      }
    }

    const message = lastError instanceof Error ? lastError.message : 'Unknown error';
    throw new Error(
      `Solana ${operation} failed after ${this.config.maxRetries + 1} attempts: ${message}`
    );
  }

  private async submitMemoTransaction(
    proofHash: string
  ): Promise<{ txSignature: string; solanaSlot: number }> {
    const payer = this.getPayer();
    const memoInstruction = new TransactionInstruction({
      programId: MEMO_PROGRAM_ID,
      keys: [],
      data: Buffer.from(proofHash, 'utf8'),
    });

    const latestBlockhash = await withTimeout(
      this.connection.getLatestBlockhash('confirmed'),
      this.config.timeoutMs,
      'getLatestBlockhash'
    );

    const tx = new Transaction({
      feePayer: payer.publicKey,
      recentBlockhash: latestBlockhash.blockhash,
    }).add(memoInstruction);
    tx.sign(payer);

    const txSignature = await withTimeout(
      this.connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        maxRetries: 0,
      }),
      this.config.timeoutMs,
      'sendRawTransaction'
    );

    const confirmation = await withTimeout(
      this.connection.confirmTransaction(
        {
          signature: txSignature,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        },
        'confirmed'
      ),
      this.config.timeoutMs,
      'confirmTransaction'
    );

    if (confirmation.value.err) {
      throw new Error(`Solana transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    return {
      txSignature,
      solanaSlot: confirmation.context.slot,
    };
  }

  private async isSignatureConfirmed(txSignature: string): Promise<boolean> {
    const response = await withTimeout(
      this.connection.getSignatureStatuses([txSignature], {
        searchTransactionHistory: true,
      }),
      this.config.timeoutMs,
      'getSignatureStatuses'
    );

    const status = response.value[0];
    if (!status || status.err) {
      return false;
    }

    return status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized';
  }

  private getPayer(): Keypair {
    if (this.payer) {
      return this.payer;
    }

    const candidates = [
      process.env.SOLANA_ANCHOR_SECRET_KEY,
      process.env.SOLANA_ANCHOR_PRIVATE_KEY,
      process.env.SOLANA_PRIVATE_KEY,
      process.env.SOLANA_KEYPAIR,
    ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

    for (const candidate of candidates) {
      const secretKey = parseSecretKey(candidate);
      if (!secretKey || secretKey.length < 32) {
        continue;
      }

      try {
        const payer = Keypair.fromSecretKey(secretKey);
        this.payer = payer;
        logger.info({ payer: payer.publicKey.toBase58() }, 'Loaded Solana anchor payer');
        return payer;
      } catch {
        continue;
      }
    }

    throw new Error(
      'Missing valid Solana anchor payer keypair. Set SOLANA_ANCHOR_SECRET_KEY with a JSON byte array.'
    );
  }
}

export function normalizeTxSignature(value: string): string | null {
  return normalizeSignature(value);
}

export function normalizeAnchorMeta(value: unknown): SolanaAnchorMeta | null {
  return toAnchorMeta(value);
}

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaClient = void 0;
exports.canonicalStringify = canonicalStringify;
exports.sha256Hex = sha256Hex;
exports.normalizeProofHash = normalizeProofHash;
exports.buildProofInputs = buildProofInputs;
exports.normalizeTxSignature = normalizeTxSignature;
exports.normalizeAnchorMeta = normalizeAnchorMeta;
const crypto_1 = __importDefault(require("crypto"));
const web3_js_1 = require("@solana/web3.js");
const logger_1 = __importDefault(require("../../config/logger"));
const DEFAULT_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 300;
const STUB_SLOT_BASE = 320_000_000;
const MEMO_PROGRAM_ID = new web3_js_1.PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function parseBoolean(raw, fallback) {
    if (!raw)
        return fallback;
    return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}
function parseInteger(raw, fallback, min, max) {
    if (!raw)
        return fallback;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed))
        return fallback;
    return Math.max(min, Math.min(max, parsed));
}
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function withTimeout(promise, timeoutMs, label) {
    return new Promise((resolve, reject) => {
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
function toCanonicalValue(input) {
    if (input === undefined)
        return undefined;
    if (input === null)
        return null;
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
        const arr = [];
        for (const item of input) {
            const normalized = toCanonicalValue(item);
            if (normalized !== undefined) {
                arr.push(normalized);
            }
        }
        return arr;
    }
    if (typeof input === 'object') {
        const out = {};
        const obj = input;
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
function canonicalStringify(value) {
    const normalized = toCanonicalValue(value);
    return JSON.stringify(normalized ?? null);
}
function sha256Hex(value) {
    return crypto_1.default.createHash('sha256').update(value).digest('hex');
}
function normalizeAuthorizedKeys(keys) {
    const normalized = keys
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
    return Array.from(new Set(normalized)).sort((a, b) => a.localeCompare(b));
}
function parseWindowBound(value) {
    if (typeof value === 'number' && Number.isFinite(value))
        return value;
    if (typeof value === 'string') {
        const asNumber = Number.parseFloat(value);
        if (Number.isFinite(asNumber))
            return asNumber;
        const asDate = Date.parse(value);
        if (Number.isFinite(asDate))
            return asDate;
    }
    throw new Error('timestampWindow bounds must be valid numbers or ISO timestamps');
}
function normalizeHex32(value) {
    const trimmed = value.trim().toLowerCase();
    const normalized = trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed;
    if (!/^[a-f0-9]{64}$/.test(normalized)) {
        return null;
    }
    return `0x${normalized}`;
}
function normalizeSignature(value) {
    const trimmed = value.trim();
    if (!/^[1-9A-HJ-NP-Za-km-z]{43,128}$/.test(trimmed)) {
        return null;
    }
    return trimmed;
}
function coerceSlot(value) {
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
function base58Encode(bytes) {
    if (bytes.length === 0)
        return '';
    const digits = [0];
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
        }
        else {
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
function parseSecretKey(raw) {
    const trimmed = raw.trim();
    if (!trimmed)
        return null;
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
            const parsed = JSON.parse(trimmed);
            if (!Array.isArray(parsed))
                return null;
            const numbers = parsed.map((value) => Number(value));
            if (numbers.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
                return null;
            }
            return Uint8Array.from(numbers);
        }
        catch {
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
        }
        catch {
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
function normalizeProofHash(value) {
    return normalizeHex32(value);
}
function buildProofInputs(request) {
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
function toAnchorMeta(value) {
    if (!value || typeof value !== 'object')
        return null;
    const row = value;
    const proofHash = typeof row.proofHash === 'string' ? normalizeHex32(row.proofHash) : null;
    const txSignature = typeof row.txSignature === 'string' ? normalizeSignature(row.txSignature) : null;
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
class SolanaClient {
    config;
    anchors = new Map();
    connection;
    payer = null;
    constructor(config = {}) {
        this.config = {
            rpcUrl: config.rpcUrl || DEFAULT_RPC_URL,
            live: typeof config.live === 'boolean'
                ? config.live
                : parseBoolean(process.env.SOLANA_ANCHOR_LIVE, false),
            timeoutMs: config.timeoutMs ??
                parseInteger(process.env.SOLANA_ANCHOR_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 1_000, 120_000),
            maxRetries: config.maxRetries ??
                parseInteger(process.env.SOLANA_ANCHOR_MAX_RETRIES, DEFAULT_MAX_RETRIES, 0, 8),
            retryDelayMs: config.retryDelayMs ??
                parseInteger(process.env.SOLANA_ANCHOR_RETRY_DELAY_MS, DEFAULT_RETRY_DELAY_MS, 50, 10_000),
        };
        this.connection = new web3_js_1.Connection(this.config.rpcUrl, 'confirmed');
    }
    isLiveMode() {
        return this.config.live;
    }
    getConfig() {
        return { ...this.config };
    }
    async anchorProof(request) {
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
        const onChain = await this.callWithRetry('anchorProof', async () => this.submitMemoTransaction(proofHash));
        const result = {
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
    async verifyProof(proofHash, options = {}) {
        const normalized = normalizeProofHash(proofHash);
        if (!normalized) {
            throw new Error('Invalid proof hash');
        }
        const anchor = this.anchors.get(normalized);
        if (!anchor) {
            return { verified: false, anchorMeta: null };
        }
        if (this.config.live && options.queryChain !== false) {
            const confirmed = await this.callWithRetry('verifyProof', async () => this.isSignatureConfirmed(anchor.txSignature));
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
    async getAnchors(query) {
        const limit = Math.max(1, Math.min(200, query.limit));
        const offset = Math.max(0, query.offset);
        let anchors = Array.from(this.anchors.values()).sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
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
    buildSimulatedAnchor(proofHash, timestamp) {
        return {
            txSignature: this.deriveStubSignature(proofHash, timestamp),
            solanaSlot: this.deriveStubSlot(proofHash),
            anchorId: `solana-anchor-${sha256Hex(`${proofHash}:anchor`).slice(0, 16)}`,
            timestamp,
        };
    }
    deriveStubSignature(proofHash, timestamp) {
        const partA = Buffer.from(sha256Hex(`${proofHash}:sig:${timestamp}`), 'hex');
        const partB = Buffer.from(sha256Hex(`${timestamp}:sig:${proofHash}`), 'hex');
        return base58Encode(Buffer.concat([partA, partB]));
    }
    deriveStubSlot(proofHash) {
        const offset = Number.parseInt(sha256Hex(`${proofHash}:slot`).slice(0, 8), 16);
        return STUB_SLOT_BASE + (offset % 20_000_000);
    }
    async callWithRetry(operation, fn) {
        let lastError = null;
        for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
            try {
                return await fn();
            }
            catch (error) {
                lastError = error;
                if (attempt >= this.config.maxRetries) {
                    break;
                }
                const delayMs = this.config.retryDelayMs * (2 ** attempt);
                logger_1.default.warn({ err: error, operation, attempt: attempt + 1, delayMs }, 'Solana operation failed, retrying');
                await delay(delayMs);
            }
        }
        const message = lastError instanceof Error ? lastError.message : 'Unknown error';
        throw new Error(`Solana ${operation} failed after ${this.config.maxRetries + 1} attempts: ${message}`);
    }
    async submitMemoTransaction(proofHash) {
        const payer = this.getPayer();
        const memoInstruction = new web3_js_1.TransactionInstruction({
            programId: MEMO_PROGRAM_ID,
            keys: [],
            data: Buffer.from(proofHash, 'utf8'),
        });
        const latestBlockhash = await withTimeout(this.connection.getLatestBlockhash('confirmed'), this.config.timeoutMs, 'getLatestBlockhash');
        const tx = new web3_js_1.Transaction({
            feePayer: payer.publicKey,
            recentBlockhash: latestBlockhash.blockhash,
        }).add(memoInstruction);
        tx.sign(payer);
        const txSignature = await withTimeout(this.connection.sendRawTransaction(tx.serialize(), {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
            maxRetries: 0,
        }), this.config.timeoutMs, 'sendRawTransaction');
        const confirmation = await withTimeout(this.connection.confirmTransaction({
            signature: txSignature,
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        }, 'confirmed'), this.config.timeoutMs, 'confirmTransaction');
        if (confirmation.value.err) {
            throw new Error(`Solana transaction failed: ${JSON.stringify(confirmation.value.err)}`);
        }
        return {
            txSignature,
            solanaSlot: confirmation.context.slot,
        };
    }
    async isSignatureConfirmed(txSignature) {
        const response = await withTimeout(this.connection.getSignatureStatuses([txSignature], {
            searchTransactionHistory: true,
        }), this.config.timeoutMs, 'getSignatureStatuses');
        const status = response.value[0];
        if (!status || status.err) {
            return false;
        }
        return status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized';
    }
    getPayer() {
        if (this.payer) {
            return this.payer;
        }
        const candidates = [
            process.env.SOLANA_ANCHOR_SECRET_KEY,
            process.env.SOLANA_ANCHOR_PRIVATE_KEY,
            process.env.SOLANA_PRIVATE_KEY,
            process.env.SOLANA_KEYPAIR,
        ].filter((value) => typeof value === 'string' && value.trim().length > 0);
        for (const candidate of candidates) {
            const secretKey = parseSecretKey(candidate);
            if (!secretKey || secretKey.length < 32) {
                continue;
            }
            try {
                const payer = web3_js_1.Keypair.fromSecretKey(secretKey);
                this.payer = payer;
                logger_1.default.info({ payer: payer.publicKey.toBase58() }, 'Loaded Solana anchor payer');
                return payer;
            }
            catch {
                continue;
            }
        }
        throw new Error('Missing valid Solana anchor payer keypair. Set SOLANA_ANCHOR_SECRET_KEY with a JSON byte array.');
    }
}
exports.SolanaClient = SolanaClient;
function normalizeTxSignature(value) {
    return normalizeSignature(value);
}
function normalizeAnchorMeta(value) {
    return toAnchorMeta(value);
}
//# sourceMappingURL=client.js.map
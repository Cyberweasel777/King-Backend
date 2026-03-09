"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AztecClient = void 0;
exports.canonicalStringify = canonicalStringify;
exports.sha256Hex = sha256Hex;
exports.normalizeProofHash = normalizeProofHash;
exports.buildProofInputs = buildProofInputs;
const crypto_1 = __importDefault(require("crypto"));
const logger_1 = __importDefault(require("../../config/logger"));
const DEFAULT_RPC_URL = process.env.AZTEC_RPC_URL || 'http://127.0.0.1:8081';
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 300;
const STUB_BLOCK_BASE = 2_500_000;
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
function coerceBlockNumber(value) {
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
    const proofHash = sha256Hex(`noir:aar:${proofInputHash}`);
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
    const txHash = typeof row.txHash === 'string' ? normalizeHex32(row.txHash) : null;
    const block = coerceBlockNumber(row.block);
    const timestamp = typeof row.timestamp === 'string' ? row.timestamp : null;
    const anchorId = typeof row.anchorId === 'string' ? row.anchorId : null;
    if (!proofHash || !txHash || block === null || !timestamp || !anchorId) {
        return null;
    }
    return {
        proofHash,
        txHash,
        block,
        timestamp,
        anchorId,
    };
}
class AztecClient {
    config;
    stubAnchors = new Map();
    constructor(config = {}) {
        this.config = {
            rpcUrl: config.rpcUrl || DEFAULT_RPC_URL,
            live: typeof config.live === 'boolean'
                ? config.live
                : parseBoolean(process.env.AZTEC_LIVE, false),
            timeoutMs: config.timeoutMs ??
                parseInteger(process.env.AZTEC_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 1_000, 120_000),
            maxRetries: config.maxRetries ??
                parseInteger(process.env.AZTEC_MAX_RETRIES, DEFAULT_MAX_RETRIES, 0, 8),
            retryDelayMs: config.retryDelayMs ??
                parseInteger(process.env.AZTEC_RETRY_DELAY_MS, DEFAULT_RETRY_DELAY_MS, 50, 10_000),
        };
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
            this.stubAnchors.set(proofHash, {
                proofHash,
                txHash: simulated.txHash,
                block: simulated.aztecBlock,
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
        const payload = {
            proofHash,
            proofInputs,
            receipt: request.receipt,
            authorizedKeys: request.authorizedKeys,
            timestampWindow: request.timestampWindow,
        };
        const rpcResult = await this.callRpcWithRetry('botindex_anchorProof', [payload]);
        const row = rpcResult && typeof rpcResult === 'object'
            ? rpcResult
            : {};
        const txHash = typeof row.txHash === 'string'
            ? normalizeHex32(row.txHash) || this.deriveTxHash(proofHash, timestamp)
            : this.deriveTxHash(proofHash, timestamp);
        const aztecBlock = coerceBlockNumber(row.aztecBlock ?? row.blockNumber ?? row.block) ??
            this.deriveBlock(proofHash);
        const anchorId = typeof row.anchorId === 'string' && row.anchorId.trim().length > 0
            ? row.anchorId
            : `aztec-anchor-${sha256Hex(`${proofHash}:anchor`).slice(0, 16)}`;
        const resultTimestamp = typeof row.timestamp === 'string' && row.timestamp.trim().length > 0
            ? row.timestamp
            : timestamp;
        return {
            proofHash,
            txHash,
            aztecBlock,
            anchorId,
            timestamp: resultTimestamp,
            receiptHash: proofInputs.receiptHash,
            authorizedKeysHash: proofInputs.authorizedKeysHash,
            timestampWindowHash: proofInputs.timestampWindowHash,
            proofInputHash: proofInputs.proofInputHash,
        };
    }
    async verifyProof(proofHash) {
        const normalized = normalizeProofHash(proofHash);
        if (!normalized) {
            throw new Error('Invalid proof hash');
        }
        if (!this.config.live) {
            const anchor = this.stubAnchors.get(normalized);
            if (!anchor) {
                return { verified: false, anchorMeta: null };
            }
            return {
                verified: true,
                anchorMeta: {
                    block: anchor.block,
                    timestamp: anchor.timestamp,
                    anchorId: anchor.anchorId,
                },
            };
        }
        const rpcResult = await this.callRpcWithRetry('botindex_verifyProof', [normalized]);
        const row = rpcResult && typeof rpcResult === 'object'
            ? rpcResult
            : {};
        const verified = Boolean(row.verified);
        if (!verified) {
            return { verified: false, anchorMeta: null };
        }
        const block = coerceBlockNumber(row.block ?? row.aztecBlock ?? row.blockNumber);
        const timestamp = typeof row.timestamp === 'string' ? row.timestamp : null;
        const anchorId = typeof row.anchorId === 'string' ? row.anchorId : null;
        if (block === null || !timestamp || !anchorId) {
            return { verified: false, anchorMeta: null };
        }
        return {
            verified: true,
            anchorMeta: { block, timestamp, anchorId },
        };
    }
    async getAnchors(query) {
        const limit = Math.max(1, Math.min(200, query.limit));
        const offset = Math.max(0, query.offset);
        if (!this.config.live) {
            let anchors = Array.from(this.stubAnchors.values()).sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
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
        const rpcResult = await this.callRpcWithRetry('botindex_listAnchors', [
            { limit, offset, since: query.since ?? null },
        ]);
        const row = rpcResult && typeof rpcResult === 'object'
            ? rpcResult
            : {};
        const items = Array.isArray(row.anchors) ? row.anchors : [];
        const anchors = items
            .map((item) => toAnchorMeta(item))
            .filter((item) => item !== null);
        const total = coerceBlockNumber(row.total) ?? anchors.length;
        const hasMore = Boolean(row.hasMore) || offset + anchors.length < total;
        return {
            total,
            anchors,
            hasMore,
        };
    }
    buildSimulatedAnchor(proofHash, timestamp) {
        return {
            txHash: this.deriveTxHash(proofHash, timestamp),
            aztecBlock: this.deriveBlock(proofHash),
            anchorId: `aztec-anchor-${sha256Hex(`${proofHash}:anchor`).slice(0, 16)}`,
            timestamp,
        };
    }
    deriveTxHash(proofHash, timestamp) {
        return `0x${sha256Hex(`${proofHash}:tx:${timestamp}`).slice(0, 64)}`;
    }
    deriveBlock(proofHash) {
        const offset = Number.parseInt(sha256Hex(`${proofHash}:block`).slice(0, 6), 16);
        return STUB_BLOCK_BASE + (offset % 500_000);
    }
    async callRpcWithRetry(method, params) {
        let lastError = null;
        for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
            try {
                return await this.callRpc(method, params);
            }
            catch (error) {
                lastError = error;
                if (attempt >= this.config.maxRetries) {
                    break;
                }
                const delayMs = this.config.retryDelayMs * (2 ** attempt);
                logger_1.default.warn({ err: error, method, attempt: attempt + 1, delayMs }, 'Aztec RPC call failed, retrying');
                await delay(delayMs);
            }
        }
        const message = lastError instanceof Error ? lastError.message : 'Unknown error';
        throw new Error(`Aztec RPC ${method} failed after ${this.config.maxRetries + 1} attempts: ${message}`);
    }
    async callRpc(method, params) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
        try {
            const response = await fetch(this.config.rpcUrl, {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: Date.now(),
                    method,
                    params,
                }),
                signal: controller.signal,
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status} from Aztec RPC`);
            }
            const payload = (await response.json());
            if (payload.error) {
                const code = payload.error.code !== undefined ? ` (${payload.error.code})` : '';
                throw new Error(`RPC error${code}: ${payload.error.message || 'Unknown error'}`);
            }
            return payload.result;
        }
        catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                throw new Error(`Aztec RPC timeout after ${this.config.timeoutMs}ms`);
            }
            throw error;
        }
        finally {
            clearTimeout(timeout);
        }
    }
}
exports.AztecClient = AztecClient;
//# sourceMappingURL=client.js.map
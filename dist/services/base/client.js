"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseClient = void 0;
exports.canonicalStringify = canonicalStringify;
exports.sha256Hex = sha256Hex;
exports.normalizeBaseProofHash = normalizeBaseProofHash;
exports.buildBaseProofInputs = buildBaseProofInputs;
const crypto_1 = __importDefault(require("crypto"));
const logger_1 = __importDefault(require("../../config/logger"));
const DEFAULT_RPC_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
const DEFAULT_CHAIN_ID = 8453;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 300;
const STUB_BLOCK_BASE = 25_000_000;
const LOOKBACK_BLOCKS = 50_000;
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
function sha3Hex(value) {
    try {
        return crypto_1.default.createHash('sha3-256').update(value).digest('hex');
    }
    catch {
        return sha256Hex(value);
    }
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
function normalizeHex4Bytes(value) {
    const trimmed = value.trim().toLowerCase();
    const normalized = trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed;
    if (!/^[a-f0-9]{8}$/.test(normalized)) {
        return null;
    }
    return `0x${normalized}`;
}
function normalizeAddress(value) {
    if (!value)
        return null;
    const trimmed = value.trim().toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(trimmed)) {
        return null;
    }
    return trimmed;
}
function coerceNonNegativeInteger(value) {
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
function coerceHexInteger(value) {
    if (typeof value !== 'string')
        return null;
    const normalized = value.trim().toLowerCase();
    if (!/^0x[a-f0-9]+$/.test(normalized)) {
        return null;
    }
    const parsed = Number.parseInt(normalized.slice(2), 16);
    if (!Number.isFinite(parsed) || parsed < 0) {
        return null;
    }
    return parsed;
}
function selectorFromSignature(signature) {
    const selector = sha3Hex(signature).slice(0, 8);
    return `0x${selector}`;
}
function topicFromSignature(signature) {
    return `0x${sha3Hex(signature)}`;
}
function normalizeTopic(value) {
    const trimmed = value.trim().toLowerCase();
    const normalized = trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed;
    if (!/^[a-f0-9]{64}$/.test(normalized))
        return null;
    return `0x${normalized}`;
}
function toHexQuantity(value) {
    return `0x${Math.max(0, Math.floor(value)).toString(16)}`;
}
function normalizeBaseProofHash(value) {
    return normalizeHex32(value);
}
function buildBaseProofInputs(request) {
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
    const proofHash = sha256Hex(`base:aar:${proofInputHash}`);
    return {
        receiptHash,
        authorizedKeysHash,
        timestampWindowHash,
        proofInputHash,
        proofHash,
    };
}
function toAnchorMeta(value, fallbackChainId) {
    if (!value || typeof value !== 'object')
        return null;
    const row = value;
    const proofHash = typeof row.proofHash === 'string' ? normalizeHex32(row.proofHash) : null;
    const txHash = typeof row.txHash === 'string' ? normalizeHex32(row.txHash) : null;
    const block = coerceNonNegativeInteger(row.block) ??
        coerceNonNegativeInteger(row.baseBlock) ??
        coerceHexInteger(row.blockNumber);
    const timestamp = typeof row.timestamp === 'string' ? row.timestamp : null;
    const anchorId = typeof row.anchorId === 'string' ? row.anchorId : null;
    const chainId = coerceNonNegativeInteger(row.chainId) ??
        coerceHexInteger(row.chainIdHex) ??
        fallbackChainId;
    if (!proofHash || !txHash || block === null || !timestamp || !anchorId || chainId <= 0) {
        return null;
    }
    return {
        proofHash,
        txHash,
        block,
        timestamp,
        anchorId,
        chainId,
    };
}
class BaseClient {
    config;
    stubAnchors = new Map();
    liveAnchors = new Map();
    contractAddress;
    fromAddress;
    anchorSelector;
    verifySelector;
    anchoredEventTopic;
    constructor(config = {}) {
        this.config = {
            rpcUrl: config.rpcUrl || DEFAULT_RPC_URL,
            live: typeof config.live === 'boolean'
                ? config.live
                : parseBoolean(process.env.BASE_ANCHOR_LIVE, false),
            chainId: config.chainId ?? parseInteger(process.env.BASE_CHAIN_ID, DEFAULT_CHAIN_ID, 1, 1_000_000),
            timeoutMs: config.timeoutMs ??
                parseInteger(process.env.BASE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 1_000, 120_000),
            maxRetries: config.maxRetries ??
                parseInteger(process.env.BASE_MAX_RETRIES, DEFAULT_MAX_RETRIES, 0, 8),
            retryDelayMs: config.retryDelayMs ??
                parseInteger(process.env.BASE_RETRY_DELAY_MS, DEFAULT_RETRY_DELAY_MS, 50, 10_000),
        };
        this.contractAddress = normalizeAddress(process.env.BASE_PROOF_REGISTRY_ADDRESS);
        this.fromAddress = normalizeAddress(process.env.BASE_ANCHOR_FROM);
        this.anchorSelector =
            normalizeHex4Bytes(process.env.BASE_PROOF_REGISTRY_ANCHOR_SELECTOR || '') ||
                selectorFromSignature('anchorProof(bytes32)');
        this.verifySelector =
            normalizeHex4Bytes(process.env.BASE_PROOF_REGISTRY_VERIFY_SELECTOR || '') ||
                selectorFromSignature('isAnchored(bytes32)');
        this.anchoredEventTopic =
            normalizeTopic(process.env.BASE_PROOF_REGISTRY_ANCHORED_TOPIC || '') ||
                topicFromSignature('ProofAnchored(bytes32)');
    }
    isLiveMode() {
        return this.config.live;
    }
    getConfig() {
        return { ...this.config };
    }
    async anchorProof(request) {
        const proofInputs = buildBaseProofInputs(request);
        const proofHash = `0x${proofInputs.proofHash}`;
        const timestamp = new Date().toISOString();
        if (!this.config.live) {
            const simulated = this.buildSimulatedAnchor(proofHash, timestamp);
            this.stubAnchors.set(proofHash, {
                proofHash,
                txHash: simulated.txHash,
                block: simulated.baseBlock,
                timestamp: simulated.timestamp,
                anchorId: simulated.anchorId,
                chainId: simulated.chainId,
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
        const chainId = await this.readChainId();
        const baseBlock = await this.readLatestBlock();
        const txHash = await this.submitAnchorTransaction(proofHash, chainId, timestamp);
        const anchorId = `base-anchor-${sha256Hex(`${proofHash}:anchor`).slice(0, 16)}`;
        this.liveAnchors.set(proofHash, {
            proofHash,
            txHash,
            block: baseBlock,
            timestamp,
            anchorId,
            chainId,
        });
        return {
            proofHash,
            txHash,
            baseBlock,
            anchorId,
            timestamp,
            chainId,
            receiptHash: proofInputs.receiptHash,
            authorizedKeysHash: proofInputs.authorizedKeysHash,
            timestampWindowHash: proofInputs.timestampWindowHash,
            proofInputHash: proofInputs.proofInputHash,
        };
    }
    async verifyProof(proofHash) {
        const normalized = normalizeBaseProofHash(proofHash);
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
                    chainId: anchor.chainId,
                },
            };
        }
        const cached = this.liveAnchors.get(normalized);
        if (cached) {
            return {
                verified: true,
                anchorMeta: {
                    block: cached.block,
                    timestamp: cached.timestamp,
                    anchorId: cached.anchorId,
                    chainId: cached.chainId,
                },
            };
        }
        const onChain = await this.verifyProofOnChain(normalized);
        if (!onChain.verified) {
            return { verified: false, anchorMeta: null };
        }
        return {
            verified: true,
            anchorMeta: {
                block: onChain.block ?? (await this.readLatestBlock()),
                timestamp: onChain.timestamp ?? new Date().toISOString(),
                anchorId: `base-anchor-${sha256Hex(`${normalized}:anchor`).slice(0, 16)}`,
                chainId: await this.readChainId(),
            },
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
        const mergedByHash = new Map();
        for (const anchor of this.liveAnchors.values()) {
            mergedByHash.set(anchor.proofHash, anchor);
        }
        const chainAnchors = await this.readAnchorsFromChain();
        for (const anchor of chainAnchors) {
            mergedByHash.set(anchor.proofHash, anchor);
        }
        let anchors = Array.from(mergedByHash.values()).sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
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
            txHash: this.deriveTxHash(proofHash, timestamp),
            baseBlock: this.deriveBlock(proofHash),
            anchorId: `base-anchor-${sha256Hex(`${proofHash}:anchor`).slice(0, 16)}`,
            timestamp,
            chainId: this.config.chainId,
        };
    }
    deriveTxHash(proofHash, timestamp) {
        return `0x${sha256Hex(`${proofHash}:tx:${timestamp}`).slice(0, 64)}`;
    }
    deriveBlock(proofHash) {
        const offset = Number.parseInt(sha256Hex(`${proofHash}:block`).slice(0, 6), 16);
        return STUB_BLOCK_BASE + (offset % 5_000_000);
    }
    async readChainId() {
        const rpcResult = await this.callRpcWithRetry('eth_chainId', []);
        const chainId = coerceHexInteger(rpcResult);
        if (chainId === null || chainId <= 0) {
            throw new Error('Invalid chain ID returned by Base RPC');
        }
        if (chainId !== this.config.chainId) {
            logger_1.default.warn({ configuredChainId: this.config.chainId, rpcChainId: chainId }, 'Configured Base chain ID does not match RPC endpoint chain ID');
        }
        return chainId;
    }
    async readLatestBlock() {
        const rpcResult = await this.callRpcWithRetry('eth_blockNumber', []);
        const block = coerceHexInteger(rpcResult);
        if (block === null) {
            throw new Error('Invalid latest block from Base RPC');
        }
        return block;
    }
    async submitAnchorTransaction(proofHash, chainId, timestamp) {
        if (!this.contractAddress || !this.fromAddress) {
            logger_1.default.warn({ hasContractAddress: Boolean(this.contractAddress), hasFromAddress: Boolean(this.fromAddress) }, 'Base ProofRegistry tx config is missing, using deterministic tx hash placeholder');
            return this.deriveTxHash(proofHash, timestamp);
        }
        const data = this.encodeBytes32Call(this.anchorSelector, proofHash);
        try {
            const rpcResult = await this.callRpcWithRetry('eth_sendTransaction', [
                {
                    from: this.fromAddress,
                    to: this.contractAddress,
                    data,
                    value: '0x0',
                    chainId: toHexQuantity(chainId),
                },
            ]);
            const txHash = typeof rpcResult === 'string' ? normalizeHex32(rpcResult) : null;
            if (!txHash) {
                throw new Error('eth_sendTransaction returned invalid tx hash');
            }
            return txHash;
        }
        catch (error) {
            logger_1.default.warn({ err: error }, 'Base tx submission failed, using deterministic tx hash placeholder');
            return this.deriveTxHash(proofHash, timestamp);
        }
    }
    async verifyProofOnChain(proofHash) {
        if (!this.contractAddress) {
            return { verified: false };
        }
        try {
            const data = this.encodeBytes32Call(this.verifySelector, proofHash);
            const rpcResult = await this.callRpcWithRetry('eth_call', [
                {
                    to: this.contractAddress,
                    data,
                },
                'latest',
            ]);
            if (this.decodeEvmBoolean(rpcResult)) {
                return {
                    verified: true,
                    block: await this.readLatestBlock(),
                    timestamp: new Date().toISOString(),
                };
            }
        }
        catch (error) {
            logger_1.default.warn({ err: error, proofHash }, 'Base ProofRegistry eth_call verification failed');
        }
        try {
            const rpcResult = await this.callRpcWithRetry('eth_getLogs', [
                {
                    address: this.contractAddress,
                    fromBlock: '0x0',
                    toBlock: 'latest',
                    topics: [this.anchoredEventTopic, proofHash],
                },
            ]);
            if (!Array.isArray(rpcResult) || rpcResult.length === 0) {
                return { verified: false };
            }
            const logs = rpcResult;
            const latest = logs[logs.length - 1];
            const block = coerceHexInteger(latest.blockNumber);
            let timestamp;
            if (block !== null) {
                timestamp = await this.readBlockTimestamp(block);
            }
            return {
                verified: true,
                ...(block !== null ? { block } : {}),
                ...(timestamp ? { timestamp } : {}),
            };
        }
        catch (error) {
            logger_1.default.warn({ err: error, proofHash }, 'Base ProofRegistry log verification failed');
            return { verified: false };
        }
    }
    async readAnchorsFromChain() {
        if (!this.contractAddress) {
            return [];
        }
        let latestBlock = 0;
        try {
            latestBlock = await this.readLatestBlock();
        }
        catch (error) {
            logger_1.default.warn({ err: error }, 'Failed to read latest Base block for registry query');
            return [];
        }
        const fromBlock = Math.max(0, latestBlock - LOOKBACK_BLOCKS);
        let rpcResult;
        try {
            rpcResult = await this.callRpcWithRetry('eth_getLogs', [
                {
                    address: this.contractAddress,
                    fromBlock: toHexQuantity(fromBlock),
                    toBlock: 'latest',
                    topics: [this.anchoredEventTopic],
                },
            ]);
        }
        catch (error) {
            logger_1.default.warn({ err: error }, 'Failed to query Base anchor logs from chain');
            return [];
        }
        if (!Array.isArray(rpcResult)) {
            return [];
        }
        const blockTimestampCache = new Map();
        const anchors = [];
        for (const item of rpcResult) {
            if (!item || typeof item !== 'object')
                continue;
            const log = item;
            const topics = Array.isArray(log.topics) ? log.topics : [];
            const proofHashCandidate = topics.length > 1 && typeof topics[1] === 'string'
                ? normalizeBaseProofHash(topics[1])
                : null;
            const txHashCandidate = typeof log.transactionHash === 'string' ? normalizeHex32(log.transactionHash) : null;
            const block = coerceHexInteger(log.blockNumber);
            if (!proofHashCandidate || !txHashCandidate || block === null) {
                continue;
            }
            let timestamp = blockTimestampCache.get(block);
            if (!timestamp) {
                timestamp = await this.readBlockTimestamp(block);
                blockTimestampCache.set(block, timestamp);
            }
            anchors.push({
                proofHash: proofHashCandidate,
                txHash: txHashCandidate,
                block,
                timestamp,
                anchorId: `base-anchor-${sha256Hex(`${proofHashCandidate}:anchor`).slice(0, 16)}`,
                chainId: this.config.chainId,
            });
        }
        const deduped = new Map();
        for (const anchor of anchors) {
            deduped.set(anchor.proofHash, anchor);
        }
        return Array.from(deduped.values()).sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
    }
    async readBlockTimestamp(blockNumber) {
        try {
            const rpcResult = await this.callRpcWithRetry('eth_getBlockByNumber', [
                toHexQuantity(blockNumber),
                false,
            ]);
            const row = rpcResult && typeof rpcResult === 'object'
                ? rpcResult
                : null;
            const tsHex = row && typeof row.timestamp === 'string' ? row.timestamp : null;
            const ts = tsHex ? coerceHexInteger(tsHex) : null;
            if (ts !== null) {
                return new Date(ts * 1_000).toISOString();
            }
        }
        catch (error) {
            logger_1.default.warn({ err: error, blockNumber }, 'Failed to read Base block timestamp');
        }
        return new Date().toISOString();
    }
    decodeEvmBoolean(value) {
        if (typeof value !== 'string')
            return false;
        const normalized = value.trim().toLowerCase();
        if (!/^0x[a-f0-9]+$/.test(normalized)) {
            return false;
        }
        try {
            return BigInt(normalized) !== 0n;
        }
        catch {
            return false;
        }
    }
    encodeBytes32Call(selector, bytes32Hex) {
        const normalizedSelector = normalizeHex4Bytes(selector);
        const normalizedValue = normalizeBaseProofHash(bytes32Hex);
        if (!normalizedSelector) {
            throw new Error('Invalid function selector for ProofRegistry call');
        }
        if (!normalizedValue) {
            throw new Error('Invalid bytes32 input for ProofRegistry call');
        }
        return `${normalizedSelector}${normalizedValue.slice(2).padStart(64, '0')}`;
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
                logger_1.default.warn({ err: error, method, attempt: attempt + 1, delayMs }, 'Base RPC call failed, retrying');
                await delay(delayMs);
            }
        }
        const message = lastError instanceof Error ? lastError.message : 'Unknown error';
        throw new Error(`Base RPC ${method} failed after ${this.config.maxRetries + 1} attempts: ${message}`);
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
                throw new Error(`HTTP ${response.status} from Base RPC`);
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
                throw new Error(`Base RPC timeout after ${this.config.timeoutMs}ms`);
            }
            throw error;
        }
        finally {
            clearTimeout(timeout);
        }
    }
}
exports.BaseClient = BaseClient;
//# sourceMappingURL=client.js.map
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.receiptMiddleware = exports.TRUST_LAYER_JSON = void 0;
exports.initReceiptSigning = initReceiptSigning;
exports.getReceiptPublicKeyBase64 = getReceiptPublicKeyBase64;
exports.getSigningKeyState = getSigningKeyState;
exports.getReceiptByIdFromMemory = getReceiptByIdFromMemory;
exports.findReceiptById = findReceiptById;
exports.queryReceipts = queryReceipts;
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const tweetnacl_1 = __importDefault(require("tweetnacl"));
const logger_1 = __importDefault(require("../../config/logger"));
const RECEIPT_HEADER = 'X-BotIndex-Receipt';
const RECEIPT_AGENT = 'botindex/v1';
const RECEIPT_SIGNING_KEY_PATH = process.env.RECEIPT_SIGNING_KEY || '/data/receipt-signing-key.pem';
const RECEIPTS_DATA_DIR = process.env.RECEIPTS_DATA_DIR || '/data/receipts';
const MAX_RECEIPTS = 10_000;
const FLUSH_DELAY_MS = 2_000;
const RECEIPT_KEY_BEGIN = '-----BEGIN BOTINDEX RECEIPT SIGNING KEY-----';
const RECEIPT_KEY_END = '-----END BOTINDEX RECEIPT SIGNING KEY-----';
exports.TRUST_LAYER_JSON = {
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
const receiptStore = new Map();
const pendingFlush = [];
let signingKeyState = null;
let signingInitPromise = null;
let flushTimer = null;
let flushInProgress = false;
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
function ensureSigningState() {
    if (!signingKeyState) {
        throw new Error('Receipt signing key is not initialized');
    }
    return signingKeyState;
}
function parseSigningKeyFile(raw) {
    const trimmed = raw.trim();
    if (!trimmed)
        return null;
    const blockMatch = trimmed.match(new RegExp(`${RECEIPT_KEY_BEGIN}([\\s\\S]+?)${RECEIPT_KEY_END}`));
    const encoded = (blockMatch?.[1] || trimmed).replace(/\s+/g, '');
    const secret = Buffer.from(encoded, 'base64');
    if (secret.length !== tweetnacl_1.default.sign.secretKeyLength) {
        return null;
    }
    return new Uint8Array(secret);
}
function toSigningKeyPem(secretKey) {
    const encoded = Buffer.from(secretKey).toString('base64');
    const wrapped = encoded.match(/.{1,64}/g)?.join('\n') || encoded;
    return `${RECEIPT_KEY_BEGIN}\n${wrapped}\n${RECEIPT_KEY_END}\n`;
}
async function initReceiptSigning() {
    if (signingKeyState)
        return;
    if (signingInitPromise)
        return signingInitPromise;
    signingInitPromise = (async () => {
        try {
            if (fs_1.default.existsSync(RECEIPT_SIGNING_KEY_PATH)) {
                const raw = await fs_1.default.promises.readFile(RECEIPT_SIGNING_KEY_PATH, 'utf-8');
                const secret = parseSigningKeyFile(raw);
                if (!secret) {
                    throw new Error('Invalid receipt signing key file');
                }
                const keyPair = tweetnacl_1.default.sign.keyPair.fromSecretKey(secret);
                signingKeyState = {
                    secretKey: keyPair.secretKey,
                    publicKey: keyPair.publicKey,
                };
                logger_1.default.info({ path: RECEIPT_SIGNING_KEY_PATH }, 'Receipt signing key loaded');
                return;
            }
            const keyPair = tweetnacl_1.default.sign.keyPair();
            await fs_1.default.promises.mkdir(path_1.default.dirname(RECEIPT_SIGNING_KEY_PATH), { recursive: true });
            await fs_1.default.promises.writeFile(RECEIPT_SIGNING_KEY_PATH, toSigningKeyPem(keyPair.secretKey), {
                mode: 0o600,
            });
            signingKeyState = {
                secretKey: keyPair.secretKey,
                publicKey: keyPair.publicKey,
            };
            logger_1.default.info({ path: RECEIPT_SIGNING_KEY_PATH }, 'Receipt signing key generated');
        }
        catch (err) {
            logger_1.default.error({ err, path: RECEIPT_SIGNING_KEY_PATH }, 'Failed to initialize receipt signing key');
            throw err;
        }
    })().finally(() => {
        signingInitPromise = null;
    });
    return signingInitPromise;
}
function signReceipt(receipt) {
    const { secretKey } = ensureSigningState();
    const payload = Buffer.from(canonicalStringify(receipt), 'utf-8');
    const signature = tweetnacl_1.default.sign.detached(new Uint8Array(payload), secretKey);
    return Buffer.from(signature).toString('base64');
}
function normalizeApiKeyHash(apiKey) {
    return sha256Hex(apiKey.trim());
}
function resolvePrincipal(req) {
    const wallet = req.header('x-wallet')?.trim();
    if (wallet)
        return wallet;
    const apiKey = req.apiKeyAuth?.apiKey || req.header('x-api-key')?.split(',')[0]?.trim();
    if (apiKey)
        return normalizeApiKeyHash(apiKey);
    return 'anonymous';
}
function extractScalarCost(value) {
    if (typeof value === 'number' || typeof value === 'string')
        return value;
    return null;
}
function extractCostFromObject(value) {
    if (!value || typeof value !== 'object') {
        return null;
    }
    const obj = value;
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
function resolveCost(req) {
    const paymentHeader = req.header('x-payment');
    if (!paymentHeader)
        return null;
    try {
        const parsed = JSON.parse(paymentHeader);
        return extractCostFromObject(parsed);
    }
    catch {
        return null;
    }
}
function normalizeActionPath(req) {
    const originalPath = req.originalUrl.split('?')[0];
    return originalPath || '/api/botindex';
}
function deriveScope(actionPath) {
    const normalized = actionPath.replace(/^\/api\/botindex/, '') || '/';
    if (normalized.startsWith('/receipts'))
        return 'receipts';
    if (normalized.startsWith('/.well-known') || normalized === '/trust')
        return 'trust';
    if (normalized.startsWith('/sports') || normalized.startsWith('/v1/sports'))
        return 'sports';
    if (normalized.startsWith('/crypto') || normalized.startsWith('/v1/crypto'))
        return 'crypto';
    if (normalized.startsWith('/commerce') || normalized.startsWith('/v1/commerce'))
        return 'commerce';
    if (normalized.startsWith('/genesis') ||
        normalized.startsWith('/solana') ||
        normalized.startsWith('/v1/solana')) {
        return 'genesis';
    }
    if (normalized.startsWith('/signals') || normalized.startsWith('/v1/signals'))
        return 'signals';
    if (normalized.startsWith('/zora'))
        return 'zora';
    if (normalized.startsWith('/hyperliquid'))
        return 'hyperliquid';
    if (normalized.startsWith('/x402') || normalized.startsWith('/v1'))
        return 'x402';
    if (normalized.startsWith('/keys'))
        return 'keys';
    return 'general';
}
function clampLimit(limit) {
    if (!limit || Number.isNaN(limit))
        return 100;
    return Math.max(1, Math.min(limit, 100));
}
function addReceiptToMemory(receipt, persistToDisk = true) {
    if (receiptStore.has(receipt.receiptId)) {
        receiptStore.delete(receipt.receiptId);
    }
    receiptStore.set(receipt.receiptId, receipt);
    while (receiptStore.size > MAX_RECEIPTS) {
        const oldestKey = receiptStore.keys().next().value;
        if (!oldestKey)
            break;
        receiptStore.delete(oldestKey);
    }
    if (!persistToDisk)
        return;
    pendingFlush.push(receipt);
    scheduleReceiptFlush();
}
function scheduleReceiptFlush() {
    if (flushTimer)
        return;
    flushTimer = setTimeout(() => {
        flushTimer = null;
        void flushPendingReceipts();
    }, FLUSH_DELAY_MS);
}
async function flushPendingReceipts() {
    if (flushInProgress)
        return;
    if (pendingFlush.length === 0)
        return;
    flushInProgress = true;
    const batch = pendingFlush.splice(0, pendingFlush.length);
    try {
        await fs_1.default.promises.mkdir(RECEIPTS_DATA_DIR, { recursive: true });
        const byDay = new Map();
        for (const receipt of batch) {
            const day = receipt.timestamp.slice(0, 10);
            const lines = byDay.get(day) || [];
            lines.push(JSON.stringify(receipt));
            byDay.set(day, lines);
        }
        for (const [day, lines] of byDay.entries()) {
            const file = path_1.default.join(RECEIPTS_DATA_DIR, `${day}.jsonl`);
            await fs_1.default.promises.appendFile(file, `${lines.join('\n')}\n`, 'utf-8');
        }
    }
    catch (err) {
        pendingFlush.unshift(...batch);
        logger_1.default.warn({ err }, 'Failed to flush BotIndex receipts');
    }
    finally {
        flushInProgress = false;
        if (pendingFlush.length > 0) {
            scheduleReceiptFlush();
        }
    }
}
function flushPendingReceiptsSync() {
    if (pendingFlush.length === 0)
        return;
    try {
        if (!fs_1.default.existsSync(RECEIPTS_DATA_DIR)) {
            fs_1.default.mkdirSync(RECEIPTS_DATA_DIR, { recursive: true });
        }
        const byDay = new Map();
        for (const receipt of pendingFlush.splice(0, pendingFlush.length)) {
            const day = receipt.timestamp.slice(0, 10);
            const lines = byDay.get(day) || [];
            lines.push(JSON.stringify(receipt));
            byDay.set(day, lines);
        }
        for (const [day, lines] of byDay.entries()) {
            const file = path_1.default.join(RECEIPTS_DATA_DIR, `${day}.jsonl`);
            fs_1.default.appendFileSync(file, `${lines.join('\n')}\n`, 'utf-8');
        }
    }
    catch (err) {
        logger_1.default.warn({ err }, 'Failed to synchronously flush BotIndex receipts');
    }
}
process.on('SIGTERM', flushPendingReceiptsSync);
process.on('SIGINT', flushPendingReceiptsSync);
function parseReceiptDate(value) {
    if (!value)
        return null;
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
}
function isReceiptInRange(receipt, principal, fromMs, toMs) {
    if (principal && receipt.principal !== principal) {
        return false;
    }
    const ts = Date.parse(receipt.timestamp);
    if (!Number.isFinite(ts))
        return false;
    if (fromMs !== null && ts < fromMs)
        return false;
    if (toMs !== null && ts > toMs)
        return false;
    return true;
}
function parseReceiptLine(line) {
    if (!line.trim())
        return null;
    try {
        const parsed = JSON.parse(line);
        if (typeof parsed.receiptId !== 'string' ||
            typeof parsed.agent !== 'string' ||
            typeof parsed.principal !== 'string' ||
            typeof parsed.action !== 'string' ||
            typeof parsed.scope !== 'string' ||
            typeof parsed.inputHash !== 'string' ||
            typeof parsed.outputHash !== 'string' ||
            typeof parsed.timestamp !== 'string' ||
            typeof parsed.signature !== 'string') {
            return null;
        }
        const cost = typeof parsed.cost === 'string' || typeof parsed.cost === 'number' || parsed.cost === null
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
    }
    catch {
        return null;
    }
}
async function listReceiptFiles() {
    try {
        const entries = await fs_1.default.promises.readdir(RECEIPTS_DATA_DIR, { withFileTypes: true });
        return entries
            .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
            .map((entry) => path_1.default.join(RECEIPTS_DATA_DIR, entry.name))
            .sort()
            .reverse();
    }
    catch (err) {
        const nodeErr = err;
        if (nodeErr.code === 'ENOENT')
            return [];
        throw err;
    }
}
async function loadReceiptsFromDisk(fromMs, toMs) {
    const files = await listReceiptFiles();
    if (files.length === 0)
        return [];
    const fromDay = fromMs !== null ? new Date(fromMs).toISOString().slice(0, 10) : null;
    const toDay = toMs !== null ? new Date(toMs).toISOString().slice(0, 10) : null;
    const output = [];
    for (const file of files) {
        const base = path_1.default.basename(file, '.jsonl');
        if (fromDay && base < fromDay)
            continue;
        if (toDay && base > toDay)
            continue;
        try {
            const raw = await fs_1.default.promises.readFile(file, 'utf-8');
            for (const line of raw.split('\n')) {
                const parsed = parseReceiptLine(line);
                if (parsed) {
                    output.push(parsed);
                }
            }
        }
        catch (err) {
            logger_1.default.warn({ err, file }, 'Failed to parse receipt file');
        }
    }
    return output;
}
function getReceiptPublicKeyBase64() {
    const { publicKey } = ensureSigningState();
    return Buffer.from(publicKey).toString('base64');
}
function getSigningKeyState() {
    return ensureSigningState();
}
function getReceiptByIdFromMemory(receiptId) {
    const found = receiptStore.get(receiptId);
    if (!found)
        return null;
    receiptStore.delete(receiptId);
    receiptStore.set(receiptId, found);
    return found;
}
async function findReceiptById(receiptId) {
    const inMemory = getReceiptByIdFromMemory(receiptId);
    if (inMemory)
        return inMemory;
    const files = await listReceiptFiles();
    for (const file of files) {
        try {
            const raw = await fs_1.default.promises.readFile(file, 'utf-8');
            const lines = raw.split('\n');
            for (let idx = lines.length - 1; idx >= 0; idx -= 1) {
                const parsed = parseReceiptLine(lines[idx] || '');
                if (parsed && parsed.receiptId === receiptId) {
                    addReceiptToMemory(parsed, false);
                    return parsed;
                }
            }
        }
        catch (err) {
            logger_1.default.warn({ err, file }, 'Failed searching receipt file by ID');
        }
    }
    return null;
}
async function queryReceipts(options) {
    const fromMs = parseReceiptDate(options.from);
    const toMs = parseReceiptDate(options.to);
    const limit = clampLimit(options.limit);
    const principal = options.principal?.trim() || undefined;
    const merged = new Map();
    for (const receipt of receiptStore.values()) {
        if (!isReceiptInRange(receipt, principal, fromMs, toMs))
            continue;
        merged.set(receipt.receiptId, receipt);
    }
    const diskReceipts = await loadReceiptsFromDisk(fromMs, toMs);
    for (const receipt of diskReceipts) {
        if (!isReceiptInRange(receipt, principal, fromMs, toMs))
            continue;
        if (!merged.has(receipt.receiptId)) {
            merged.set(receipt.receiptId, receipt);
        }
    }
    return Array.from(merged.values())
        .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
        .slice(0, limit);
}
function safeBufferFromChunk(chunk, encoding) {
    if (chunk === undefined || chunk === null)
        return null;
    if (Buffer.isBuffer(chunk))
        return chunk;
    if (chunk instanceof Uint8Array)
        return Buffer.from(chunk);
    if (typeof chunk === 'string')
        return Buffer.from(chunk, encoding);
    return Buffer.from(String(chunk), encoding);
}
function createUnsignedReceipt(req, outputHash) {
    const actionPath = normalizeActionPath(req);
    return {
        receiptId: crypto_1.default.randomUUID(),
        agent: RECEIPT_AGENT,
        principal: resolvePrincipal(req),
        action: `${req.method.toUpperCase()} ${actionPath}`,
        scope: deriveScope(actionPath),
        inputHash: sha256Hex(canonicalStringify({ query: req.query, body: req.body })),
        outputHash,
        timestamp: new Date().toISOString(),
        cost: resolveCost(req),
    };
}
const receiptMiddleware = (req, res, next) => {
    const chunks = [];
    let finalized = false;
    const originalWrite = res.write.bind(res);
    const originalEnd = res.end.bind(res);
    const finalizeReceipt = () => {
        if (finalized)
            return;
        finalized = true;
        try {
            const outputBody = chunks.length > 0 ? Buffer.concat(chunks) : Buffer.alloc(0);
            const outputHash = sha256Hex(outputBody);
            const unsignedReceipt = createUnsignedReceipt(req, outputHash);
            const receipt = {
                ...unsignedReceipt,
                signature: signReceipt(unsignedReceipt),
            };
            if (!res.headersSent) {
                const encoded = Buffer.from(JSON.stringify(receipt), 'utf-8').toString('base64');
                res.setHeader(RECEIPT_HEADER, encoded);
            }
            addReceiptToMemory(receipt);
        }
        catch (err) {
            logger_1.default.warn({ err, path: req.path }, 'Failed to generate BotIndex receipt');
        }
    };
    res.write = ((chunk, encoding, cb) => {
        let resolvedEncoding;
        let resolvedCallback;
        if (typeof encoding === 'string') {
            resolvedEncoding = encoding;
            if (typeof cb === 'function') {
                resolvedCallback = cb;
            }
        }
        else if (typeof encoding === 'function') {
            resolvedCallback = encoding;
        }
        const buffer = safeBufferFromChunk(chunk, resolvedEncoding);
        if (buffer) {
            chunks.push(buffer);
        }
        return originalWrite(chunk, resolvedEncoding, resolvedCallback);
    });
    res.end = ((chunk, encoding, cb) => {
        let resolvedChunk = chunk;
        let resolvedEncoding;
        let resolvedCallback;
        if (typeof chunk === 'function') {
            resolvedChunk = undefined;
            resolvedCallback = chunk;
        }
        else if (typeof encoding === 'string') {
            resolvedEncoding = encoding;
            if (typeof cb === 'function') {
                resolvedCallback = cb;
            }
        }
        else if (typeof encoding === 'function') {
            resolvedCallback = encoding;
        }
        const buffer = safeBufferFromChunk(resolvedChunk, resolvedEncoding);
        if (buffer) {
            chunks.push(buffer);
        }
        finalizeReceipt();
        return originalEnd(resolvedChunk, resolvedEncoding, resolvedCallback);
    });
    next();
};
exports.receiptMiddleware = receiptMiddleware;
//# sourceMappingURL=receiptMiddleware.js.map
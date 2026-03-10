"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.optionalApiKey = exports.requireApiKey = void 0;
exports.generateApiKey = generateApiKey;
exports.updateApiKeyWallet = updateApiKeyWallet;
exports.createApiKeyEntry = createApiKeyEntry;
exports.getApiKeyEntry = getApiKeyEntry;
exports.getAllApiKeys = getAllApiKeys;
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const logger_1 = __importDefault(require("../../config/logger"));
const API_KEY_DATA_DIR = process.env.API_KEY_DATA_DIR || '/data';
const API_KEY_DATA_FILE = path_1.default.join(API_KEY_DATA_DIR, 'api-keys.json');
const apiKeyLedger = new Map();
let flushScheduled = false;
function loadLedger() {
    try {
        if (!fs_1.default.existsSync(API_KEY_DATA_FILE))
            return;
        const raw = fs_1.default.readFileSync(API_KEY_DATA_FILE, 'utf-8');
        const data = JSON.parse(raw);
        for (const [apiKey, entry] of Object.entries(data)) {
            apiKeyLedger.set(apiKey, entry);
        }
        logger_1.default.info({ apiKeys: apiKeyLedger.size }, 'BotIndex API key ledger loaded');
    }
    catch (err) {
        logger_1.default.warn({ err }, 'Failed to load BotIndex API key ledger, starting fresh');
    }
}
async function flushLedger() {
    try {
        await fs_1.default.promises.mkdir(API_KEY_DATA_DIR, { recursive: true });
        const data = {};
        for (const [apiKey, entry] of apiKeyLedger.entries()) {
            data[apiKey] = entry;
        }
        await fs_1.default.promises.writeFile(API_KEY_DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    }
    catch (err) {
        logger_1.default.warn({ err }, 'Failed to flush BotIndex API key ledger');
    }
}
function scheduleLedgerFlush() {
    if (flushScheduled)
        return;
    flushScheduled = true;
    setTimeout(() => {
        flushScheduled = false;
        void flushLedger();
    }, 500);
}
function extractApiKey(req) {
    const header = req.header('x-api-key');
    if (!header)
        return null;
    const firstValue = header.split(',')[0]?.trim();
    return firstValue || null;
}
function touchValidKey(apiKey, entry) {
    entry.requestCount += 1;
    entry.lastUsed = new Date().toISOString();
    apiKeyLedger.set(apiKey, entry);
    scheduleLedgerFlush();
}
function resolveActiveEntry(apiKey) {
    const entry = apiKeyLedger.get(apiKey);
    if (!entry)
        return null;
    if (entry.status !== 'active')
        return null;
    return entry;
}
function attachAuth(req, apiKey, entry) {
    req.apiKeyAuth = {
        apiKey,
        email: entry.email,
        plan: entry.plan,
    };
}
function generateApiKey() {
    let apiKey = `botindex_sk_${crypto_1.default.randomBytes(16).toString('hex')}`;
    while (apiKeyLedger.has(apiKey)) {
        apiKey = `botindex_sk_${crypto_1.default.randomBytes(16).toString('hex')}`;
    }
    return apiKey;
}
function updateApiKeyWallet(apiKey, walletAddress) {
    const entry = apiKeyLedger.get(apiKey);
    if (!entry)
        return false;
    entry.walletAddress = walletAddress.toLowerCase();
    scheduleLedgerFlush();
    return true;
}
function createApiKeyEntry(params) {
    const now = new Date().toISOString();
    const entry = {
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
function getApiKeyEntry(apiKey) {
    return apiKeyLedger.get(apiKey) || null;
}
const requireApiKey = (req, res, next) => {
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
exports.requireApiKey = requireApiKey;
const optionalApiKey = (req, _res, next) => {
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
exports.optionalApiKey = optionalApiKey;
loadLedger();
function getAllApiKeys() {
    return Array.from(apiKeyLedger.entries()).map(([key, entry]) => ({
        key: `${key.slice(0, 16)}...`,
        entry,
    }));
}
//# sourceMappingURL=apiKeyAuth.js.map
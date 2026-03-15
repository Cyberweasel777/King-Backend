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
function todayUTC() {
    return new Date().toISOString().slice(0, 10);
}
function isDailyLimitExceeded(entry) {
    if (!entry.dailyLimit)
        return false;
    const today = todayUTC();
    if (entry.dailyCountDate !== today)
        return false; // new day, not exceeded yet
    return (entry.dailyCount || 0) >= entry.dailyLimit;
}
function touchValidKey(apiKey, entry) {
    entry.requestCount += 1;
    entry.lastUsed = new Date().toISOString();
    // Track daily count if dailyLimit is set
    if (entry.dailyLimit) {
        const today = todayUTC();
        if (entry.dailyCountDate !== today) {
            entry.dailyCount = 1;
            entry.dailyCountDate = today;
        }
        else {
            entry.dailyCount = (entry.dailyCount || 0) + 1;
        }
    }
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
const optionalApiKey = (req, res, next) => {
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
    // Check daily limit BEFORE touching (so we don't count the rejected request)
    if (isDailyLimitExceeded(entry)) {
        // Add x402 payment-required header for agent auto-negotiation
        const { buildX402UpgradePayload } = require('./x402Gate');
        const requestUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
        const x402Upgrade = buildX402UpgradePayload(requestUrl);
        if (x402Upgrade) {
            res.setHeader('payment-required', x402Upgrade.header);
        }
        res.status(429).json({
            error: 'daily_limit_exceeded',
            message: `You've used all ${entry.dailyLimit} free requests for today. Upgrade to Pro for unlimited access, or pay per call with x402.`,
            upgrade: {
                pro: {
                    url: 'https://api.botindex.dev/api/botindex/keys/register?plan=pro',
                    price: '$29/mo',
                    description: 'Unlimited API calls. Cancel anytime.',
                    features: ['Unlimited requests', 'All 29 endpoints', 'Priority support', 'Webhook alerts'],
                },
                ...(x402Upgrade?.body || {}),
            },
            free_channels: {
                message: 'Get free delayed signals in our channels while you decide:',
                discord: 'https://discord.gg/polyhacks',
                telegram: {
                    whales: 'https://t.me/polyhacks_whales',
                    bot: 'https://t.me/polybettorbot?start=trial',
                },
            },
            resetAt: `${todayUTC()}T23:59:59Z`,
            used: entry.dailyCount,
            limit: entry.dailyLimit,
        });
        return;
    }
    touchValidKey(apiKey, entry);
    attachAuth(req, apiKey, entry);
    // Set usage headers on every response so users see remaining quota
    if (entry.dailyLimit) {
        const used = entry.dailyCount || 0;
        const remaining = Math.max(0, entry.dailyLimit - used);
        res.setHeader('X-BotIndex-Daily-Used', String(used));
        res.setHeader('X-BotIndex-Daily-Limit', String(entry.dailyLimit));
        res.setHeader('X-BotIndex-Daily-Remaining', String(remaining));
        if (remaining <= 1) {
            res.setHeader('X-BotIndex-Upgrade', 'https://api.botindex.dev/api/botindex/keys/register?plan=pro');
        }
    }
    next();
};
exports.optionalApiKey = optionalApiKey;
loadLedger();
// Backfill: ensure all free-tier keys have the 10/day limit
(function backfillFreeLimits() {
    let updated = 0;
    for (const [, entry] of apiKeyLedger.entries()) {
        if (entry.plan === 'free' && !entry.dailyLimit) {
            entry.dailyLimit = 3;
            updated++;
        }
    }
    if (updated > 0) {
        logger_1.default.info({ updated }, 'Backfilled free-tier API keys with 3 req/day limit');
        scheduleLedgerFlush();
    }
})();
function getAllApiKeys() {
    return Array.from(apiKeyLedger.entries()).map(([key, entry]) => ({
        key: `${key.slice(0, 16)}...`,
        entry,
    }));
}
//# sourceMappingURL=apiKeyAuth.js.map
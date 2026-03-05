"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.freeTrialGate = freeTrialGate;
exports.skipIfFreeTrial = skipIfFreeTrial;
exports.getTrialStats = getTrialStats;
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const logger_1 = __importDefault(require("../../config/logger"));
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
const TRIAL_DATA_FILE = path_1.default.join(TRIAL_DATA_DIR, 'free-trial-ledger.json');
const ledger = new Map();
// Load persisted ledger on startup
function loadLedger() {
    try {
        if (fs_1.default.existsSync(TRIAL_DATA_FILE)) {
            const raw = fs_1.default.readFileSync(TRIAL_DATA_FILE, 'utf-8');
            const data = JSON.parse(raw);
            for (const [hash, entry] of Object.entries(data)) {
                ledger.set(hash, entry);
            }
            logger_1.default.info({ wallets: ledger.size }, 'Free trial ledger loaded');
        }
    }
    catch (err) {
        logger_1.default.warn({ err }, 'Failed to load free trial ledger, starting fresh');
    }
}
// Async flush to disk (non-blocking)
let flushPending = false;
function scheduleLedgerFlush() {
    if (flushPending)
        return;
    flushPending = true;
    setTimeout(() => {
        flushPending = false;
        try {
            if (!fs_1.default.existsSync(TRIAL_DATA_DIR)) {
                fs_1.default.mkdirSync(TRIAL_DATA_DIR, { recursive: true });
            }
            const data = {};
            for (const [hash, entry] of ledger.entries()) {
                data[hash] = entry;
            }
            fs_1.default.writeFileSync(TRIAL_DATA_FILE, JSON.stringify(data, null, 2));
        }
        catch (err) {
            logger_1.default.warn({ err }, 'Failed to flush free trial ledger');
        }
    }, 5000);
}
loadLedger();
function hashWallet(address) {
    return crypto_1.default.createHash('sha256').update(address.toLowerCase()).digest('hex').slice(0, 16);
}
/**
 * Extract wallet address from request.
 * Priority:
 * 1. X-Wallet header (explicit)
 * 2. x402 payment header (parsed)
 * 3. Query param ?wallet=0x...
 */
function extractWallet(req) {
    // Explicit header
    const xWallet = req.headers['x-wallet'];
    if (xWallet && /^0x[a-fA-F0-9]{40}$/.test(xWallet)) {
        return xWallet;
    }
    // x402 payment header — the payment JSON contains sender wallet
    const paymentHeader = req.headers['x-payment'];
    if (paymentHeader) {
        try {
            const parsed = JSON.parse(paymentHeader);
            const sender = parsed?.payload?.authorization?.from || parsed?.from;
            if (sender && /^0x[a-fA-F0-9]{40}$/.test(sender)) {
                return sender;
            }
        }
        catch {
            // Not valid JSON, ignore
        }
    }
    // Query param fallback
    const qWallet = req.query.wallet;
    if (qWallet && /^0x[a-fA-F0-9]{40}$/.test(qWallet)) {
        return qWallet;
    }
    return null;
}
/**
 * Free trial middleware. Place BEFORE x402Gate in the middleware chain.
 * If wallet has remaining free requests, bypasses x402 and serves data.
 * If no wallet provided or trial exhausted, calls next() to hit x402Gate.
 */
function freeTrialGate(options = {}) {
    const limit = options.limit ?? FREE_TRIAL_LIMIT;
    return (req, res, next) => {
        const wallet = extractWallet(req);
        if (!wallet) {
            // No wallet identified — can't track trial, pass to x402
            // But intercept 402 responses to inject free trial instructions
            res.setHeader('X-BotIndex-Free-Trial', 'available');
            res.setHeader('X-BotIndex-Free-Trial-Limit', String(limit));
            res.setHeader('X-BotIndex-Free-Trial-How', 'Send X-Wallet: 0x... header to activate');
            // Monkey-patch res.json to inject free trial info into 402 responses
            const originalJson = res.json.bind(res);
            res.json = function (body) {
                if (res.statusCode === 402) {
                    const enhanced = {
                        ...body,
                        freeTrial: {
                            available: true,
                            requestsRemaining: limit,
                            howToActivate: `Add header "X-Wallet: 0xYOUR_WALLET_ADDRESS" to get ${limit} free premium requests. No signup, no API keys.`,
                            example: `curl -H "X-Wallet: 0x1234...abcd" ${req.protocol}://${req.get('host')}${req.originalUrl}`,
                        },
                    };
                    return originalJson(enhanced);
                }
                return originalJson(body);
            };
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
        logger_1.default.info({ walletHash, count: entry.count, remaining, path: req.path }, 'Free trial request served');
        // Mark request as trial-authenticated so x402 gate can be skipped
        req.__freeTrialAuthenticated = true;
        next();
    };
}
/**
 * Conditional x402 gate that skips if free trial already authenticated.
 * Wrap your existing x402Gate with this.
 */
function skipIfFreeTrial(x402Handler) {
    return (req, res, next) => {
        if (req.__freeTrialAuthenticated) {
            next();
            return;
        }
        x402Handler(req, res, next);
    };
}
/** Get trial stats for admin/monitoring */
function getTrialStats() {
    let totalWallets = 0;
    let totalRequests = 0;
    let exhaustedWallets = 0;
    const wallets = [];
    for (const [hash, entry] of ledger.entries()) {
        totalWallets++;
        totalRequests += entry.count;
        const remaining = Math.max(0, FREE_TRIAL_LIMIT - entry.count);
        if (remaining === 0)
            exhaustedWallets++;
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
//# sourceMappingURL=freeTrial.js.map
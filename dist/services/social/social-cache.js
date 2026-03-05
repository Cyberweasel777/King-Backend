"use strict";
/**
 * Social Sentiment Cache — in-memory + file persistence
 * Follows the same pattern as freeTrial.ts ledger
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCache = getCache;
exports.getCacheAge = getCacheAge;
exports.updateCache = updateCache;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const logger_1 = __importDefault(require("../../config/logger"));
const CACHE_FILE = path_1.default.join(process.env.DATA_DIR || '/data', 'social-sentiment-cache.json');
const FLUSH_INTERVAL_MS = 30_000;
let cache = {
    convergenceSignals: [],
    sentimentResults: [],
    tweetCount: 0,
    lastRefresh: null,
    refreshDurationMs: null,
    accountsScraped: 0,
    accountsWithTweets: 0,
};
let dirty = false;
function loadFromDisk() {
    try {
        if (fs_1.default.existsSync(CACHE_FILE)) {
            const raw = fs_1.default.readFileSync(CACHE_FILE, 'utf-8');
            const parsed = JSON.parse(raw);
            cache = { ...cache, ...parsed };
            logger_1.default.info({ file: CACHE_FILE }, 'Social sentiment cache loaded from disk');
        }
    }
    catch (err) {
        logger_1.default.warn({ err }, 'Failed to load social sentiment cache from disk');
    }
}
function flushToDisk() {
    if (!dirty)
        return;
    try {
        const dir = path_1.default.dirname(CACHE_FILE);
        if (!fs_1.default.existsSync(dir)) {
            fs_1.default.mkdirSync(dir, { recursive: true });
        }
        fs_1.default.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
        dirty = false;
    }
    catch (err) {
        logger_1.default.warn({ err }, 'Failed to flush social sentiment cache to disk');
    }
}
// Load on startup
loadFromDisk();
// Flush every 30s
setInterval(flushToDisk, FLUSH_INTERVAL_MS);
function getCache() {
    return cache;
}
function getCacheAge() {
    if (!cache.lastRefresh)
        return null;
    return Date.now() - Date.parse(cache.lastRefresh);
}
function updateCache(update) {
    cache.convergenceSignals = update.convergenceSignals;
    cache.sentimentResults = update.sentimentResults;
    cache.tweetCount = update.tweets.length;
    cache.lastRefresh = new Date().toISOString();
    cache.refreshDurationMs = update.durationMs;
    cache.accountsScraped = update.accountsScraped;
    cache.accountsWithTweets = update.accountsWithTweets;
    dirty = true;
    // Immediate flush after refresh
    flushToDisk();
}
//# sourceMappingURL=social-cache.js.map
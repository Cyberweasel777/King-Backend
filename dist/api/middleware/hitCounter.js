"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hitCounter = hitCounter;
exports.getHits = getHits;
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const logger_1 = __importDefault(require("../../config/logger"));
const convex_client_1 = require("../../shared/analytics/convex-client");
const DATA_DIR = process.env.DATA_DIR || '/data';
const HITS_FILE = path_1.default.join(DATA_DIR, 'hits.json');
const FLUSH_INTERVAL_MS = 60_000; // 60 seconds
const hits = {};
const globalVisitorHashes = new Set();
let firstSeen;
const startTime = Date.now();
let dirty = false;
const convexAnalyticsStore = (0, convex_client_1.getOptionalConvexAnalyticsStore)();
let lastConvexErrorAt = 0;
function normalizeHitEntry(entry) {
    const visitorHashes = Array.isArray(entry?.visitorHashes)
        ? Array.from(new Set(entry.visitorHashes.filter((v) => typeof v === 'string')))
        : [];
    return {
        count: typeof entry?.count === 'number' ? entry.count : 0,
        lastHit: typeof entry?.lastHit === 'string' ? entry.lastHit : '',
        uniqueVisitors: visitorHashes.length,
        visitorHashes,
    };
}
function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (Array.isArray(forwarded) && forwarded.length > 0 && forwarded[0]) {
        return forwarded[0].split(',')[0].trim();
    }
    if (typeof forwarded === 'string' && forwarded.length > 0) {
        return forwarded.split(',')[0].trim();
    }
    return req.ip || 'unknown';
}
function hashIp(ip) {
    return crypto_1.default.createHash('sha256').update(ip).digest('hex').slice(0, 12);
}
function optionalHeader(req, headerName) {
    const raw = req.get(headerName);
    if (!raw)
        return undefined;
    const value = raw.trim();
    return value.length > 0 ? value : undefined;
}
function shouldTrack(pathname) {
    return pathname.includes('botindex') || pathname.includes('x402') || pathname.includes('polyhacks');
}
function beaconKey(req) {
    if (req.path.endsWith('/botindex/beacon')) {
        const page = typeof req.query.page === 'string' ? req.query.page : 'unknown';
        return `/botindex/beacon:${page}`;
    }
    if (req.path.endsWith('/polyhacks/beacon')) {
        const page = typeof req.query.page === 'string' ? req.query.page : 'unknown';
        return `/polyhacks/beacon:${page}`;
    }
    return null;
}
function reportConvexLogError(error) {
    const now = Date.now();
    if (now - lastConvexErrorAt < 60_000)
        return;
    lastConvexErrorAt = now;
    logger_1.default.warn({ err: error }, 'Convex analytics logging failed; continuing with file-based hit counter');
}
// Load persisted hits on startup
function loadFromDisk() {
    try {
        if (fs_1.default.existsSync(HITS_FILE)) {
            const raw = fs_1.default.readFileSync(HITS_FILE, 'utf-8');
            const data = JSON.parse(raw);
            if (data.hits && typeof data.hits === 'object') {
                for (const [endpoint, entry] of Object.entries(data.hits)) {
                    const normalized = normalizeHitEntry(entry);
                    hits[endpoint] = normalized;
                    for (const hash of normalized.visitorHashes) {
                        globalVisitorHashes.add(hash);
                    }
                }
            }
            if (Array.isArray(data.globalVisitorHashes)) {
                for (const hash of data.globalVisitorHashes) {
                    if (typeof hash === 'string') {
                        globalVisitorHashes.add(hash);
                    }
                }
            }
            if (typeof data.firstSeen === 'string' && data.firstSeen) {
                firstSeen = data.firstSeen;
            }
        }
    }
    catch {
        // Corrupted or missing file — start fresh
    }
    if (!firstSeen) {
        firstSeen = new Date().toISOString();
    }
}
function flushToDisk() {
    if (!dirty)
        return;
    try {
        // Ensure data dir exists (no-op if volume mounted)
        if (!fs_1.default.existsSync(DATA_DIR)) {
            fs_1.default.mkdirSync(DATA_DIR, { recursive: true });
        }
        const data = {
            hits,
            firstSeen,
            lastFlushed: new Date().toISOString(),
            globalVisitorHashes: Array.from(globalVisitorHashes),
        };
        fs_1.default.writeFileSync(HITS_FILE, JSON.stringify(data), 'utf-8');
        dirty = false;
    }
    catch {
        // Non-fatal — volume may not be mounted (dev mode)
    }
}
// Initialize
loadFromDisk();
setInterval(flushToDisk, FLUSH_INTERVAL_MS);
// Flush on graceful shutdown
process.on('SIGTERM', flushToDisk);
process.on('SIGINT', flushToDisk);
function hitCounter(req, res, next) {
    const p = req.path;
    if (shouldTrack(p)) {
        // For beacon requests, split by page param for per-site tracking
        const trackKey = beaconKey(req) || p;
        if (!hits[trackKey]) {
            hits[trackKey] = { count: 0, lastHit: '', uniqueVisitors: 0, visitorHashes: [] };
        }
        const entry = hits[trackKey];
        entry.count += 1;
        entry.lastHit = new Date().toISOString();
        const visitorHash = hashIp(getClientIp(req));
        const requestStartedAt = Date.now();
        const walletAddress = optionalHeader(req, 'X-Wallet');
        const userAgent = optionalHeader(req, 'User-Agent');
        const referrer = optionalHeader(req, 'Referer') || optionalHeader(req, 'Referrer');
        const hasXPaymentHeader = Boolean(optionalHeader(req, 'X-Payment'));
        const apiKeyPlan = req.apiKeyAuth?.plan;
        const apiKeyHash = req.apiKeyAuth?.apiKey ? hashIp(req.apiKeyAuth.apiKey) : undefined;
        if (!entry.visitorHashes.includes(visitorHash)) {
            entry.visitorHashes.push(visitorHash);
            entry.uniqueVisitors = entry.visitorHashes.length;
        }
        globalVisitorHashes.add(visitorHash);
        dirty = true;
        res.once('finish', () => {
            if (!convexAnalyticsStore)
                return;
            void convexAnalyticsStore
                .logRequest({
                endpoint: p,
                method: req.method,
                visitorHash,
                walletAddress,
                userAgent,
                referrer,
                statusCode: res.statusCode,
                x402Paid: hasXPaymentHeader && res.statusCode !== 402,
                responseTimeMs: Date.now() - requestStartedAt,
                timestamp: Date.now(),
                apiKeyHash,
                apiKeyPlan,
            })
                .catch(reportConvexLogError);
        });
    }
    next();
}
function getHits() {
    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
    const totalHits = Object.values(hits).reduce((sum, entry) => sum + entry.count, 0);
    return {
        uptime_seconds: uptimeSeconds,
        total_hits: totalHits,
        unique_visitors_total: globalVisitorHashes.size,
        hits_per_minute: uptimeSeconds > 0 ? Number((totalHits / (uptimeSeconds / 60)).toFixed(2)) : 0,
        endpoints: hits,
        since: firstSeen,
        last_restart: new Date(startTime).toISOString(),
    };
}
//# sourceMappingURL=hitCounter.js.map
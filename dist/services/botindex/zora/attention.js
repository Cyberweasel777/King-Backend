"use strict";
/**
 * Zora Attention Momentum — LIVE data from Zora REST API.
 *
 * Computes "attention momentum" by comparing TOP_GAINERS (market cap delta)
 * with TOP_VOLUME_24H to identify coins where both price action and volume
 * are accelerating. This is derived intelligence, not a direct Zora endpoint.
 *
 * Source: https://api-sdk.zora.engineering/explore
 * Lists used: TOP_GAINERS + LAST_TRADED_UNIQUE
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAttentionMomentum = getAttentionMomentum;
const logger_1 = __importDefault(require("../../../config/logger"));
const ZORA_EXPLORE_URL = 'https://api-sdk.zora.engineering/explore';
const ZORA_API_KEY = process.env.ZORA_API_KEY || '';
const CACHE_TTL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10000;
const attentionCache = new Map();
function toNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value))
        return value;
    if (typeof value === 'string') {
        const parsed = Number.parseFloat(value);
        if (Number.isFinite(parsed))
            return parsed;
    }
    return 0;
}
function round(value, decimals) {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
}
function normalizeLimit(limit) {
    if (!Number.isFinite(limit) || limit < 1)
        return 10;
    return Math.min(Math.floor(limit), 50);
}
async function fetchExploreList(listType, count) {
    const url = new URL(ZORA_EXPLORE_URL);
    url.searchParams.set('listType', listType);
    url.searchParams.set('count', String(count));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const headers = { Accept: 'application/json' };
        if (ZORA_API_KEY) {
            headers['api-key'] = ZORA_API_KEY;
        }
        const response = await fetch(url.toString(), {
            headers,
            signal: controller.signal,
        });
        if (!response.ok) {
            throw new Error(`Zora API (${listType}) returned ${response.status}`);
        }
        const payload = await response.json();
        const edges = payload?.exploreList?.edges || payload?.data?.exploreList?.edges || [];
        return edges.map((e) => e?.node).filter(Boolean);
    }
    finally {
        clearTimeout(timeout);
    }
}
async function getAttentionMomentum(limit) {
    const normalizedLimit = normalizeLimit(limit);
    const now = Date.now();
    const cached = attentionCache.get(normalizedLimit);
    if (cached && cached.expiresAt > now) {
        return cached.data;
    }
    try {
        // Fetch top gainers (price momentum) and recently traded unique (activity momentum)
        const [gainers, active] = await Promise.all([
            fetchExploreList('TOP_GAINERS', 25),
            fetchExploreList('LAST_TRADED_UNIQUE', 25),
        ]);
        // Build a set of actively traded coin addresses for cross-reference
        const activeAddresses = new Set(active.map((n) => n.address?.toLowerCase()));
        // Score each gainer: market cap delta + volume + active trading = high velocity
        const trends = [];
        for (const node of gainers) {
            if (!node.address)
                continue;
            const volume24h = toNumber(node.volume24h);
            const marketCapDelta = toNumber(node.marketCapDelta24h);
            const holders = Math.max(0, Math.floor(toNumber(node.uniqueHolders)));
            // Velocity score: weighted combination of market cap growth + volume + active trading
            const isActive = activeAddresses.has(node.address.toLowerCase());
            const volumeScore = Math.min(100, (volume24h / 10000) * 20); // scale to ~100 at $50k volume
            const deltaScore = Math.min(100, Math.abs(marketCapDelta) / 5000 * 30); // scale on delta
            const activityBonus = isActive ? 20 : 0;
            const velocityScore = round(Math.min(100, volumeScore + deltaScore + activityBonus), 2);
            const direction = marketCapDelta > 1000 ? 'up' : marketCapDelta < -1000 ? 'down' : 'flat';
            trends.push({
                coinAddress: node.address,
                name: node.name || '',
                symbol: (node.symbol || '').toUpperCase(),
                velocityScore,
                volume24h: round(volume24h, 2),
                marketCapDelta24h: round(marketCapDelta, 2),
                uniqueHolders: holders,
                direction,
                creatorHandle: node.creatorProfile?.handle || null,
            });
        }
        trends.sort((a, b) => b.velocityScore - a.velocityScore);
        const sliced = trends.slice(0, normalizedLimit);
        const data = {
            trends: sliced,
            source: 'live',
            fetchedAt: new Date().toISOString(),
        };
        logger_1.default.info({ count: sliced.length }, 'Fetched live Zora attention momentum');
        attentionCache.set(normalizedLimit, { data, expiresAt: now + CACHE_TTL_MS });
        return data;
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Failed to fetch Zora attention momentum');
        if (cached) {
            return cached.data;
        }
        return {
            trends: [],
            source: 'error',
            fetchedAt: new Date().toISOString(),
        };
    }
}
//# sourceMappingURL=attention.js.map
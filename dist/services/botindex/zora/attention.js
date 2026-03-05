"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAttentionMomentum = getAttentionMomentum;
const CACHE_TTL_MS = 5 * 60 * 1000;
const attentionCache = new Map();
function normalizeLimit(limit) {
    if (!Number.isFinite(limit) || limit < 1)
        return 10;
    return Math.min(Math.floor(limit), 50);
}
function round(value, decimals) {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
}
function getSeedAttentionTrends() {
    const seed = [
        {
            coinAddress: '0x1111111111111111111111111111111111111111',
            topic: 'onchain-music',
            velocityScore: 94.2,
            volume1h: 227310.4,
            volumeChange: 43.71,
            direction: 'up',
        },
        {
            coinAddress: '0x3333333333333333333333333333333333333333',
            topic: 'creator-collectives',
            velocityScore: 90.7,
            volume1h: 191245.9,
            volumeChange: 35.28,
            direction: 'up',
        },
        {
            coinAddress: '0x5555555555555555555555555555555555555555',
            topic: 'social-trading-clubs',
            velocityScore: 87.1,
            volume1h: 164202.15,
            volumeChange: 24.66,
            direction: 'up',
        },
        {
            coinAddress: '0x7777777777777777777777777777777777777777',
            topic: 'open-edition-season',
            velocityScore: 75.8,
            volume1h: 129384.33,
            volumeChange: 6.22,
            direction: 'flat',
        },
        {
            coinAddress: '0x8888888888888888888888888888888888888888',
            topic: 'collector-curation',
            velocityScore: 68.4,
            volume1h: 116992.42,
            volumeChange: -3.83,
            direction: 'down',
        },
        {
            coinAddress: '0x4444444444444444444444444444444444444444',
            topic: 'meme-remixes',
            velocityScore: 64.9,
            volume1h: 102810.07,
            volumeChange: -8.74,
            direction: 'down',
        },
    ];
    return seed.map((trend) => ({
        ...trend,
        velocityScore: round(trend.velocityScore, 2),
        volume1h: round(trend.volume1h, 2),
        volumeChange: round(trend.volumeChange, 2),
    }));
}
async function getAttentionMomentum(limit) {
    const normalizedLimit = normalizeLimit(limit);
    const now = Date.now();
    const cached = attentionCache.get(normalizedLimit);
    if (cached && cached.expiresAt > now) {
        return cached.data;
    }
    const trends = getSeedAttentionTrends()
        .sort((a, b) => b.velocityScore - a.velocityScore)
        .slice(0, normalizedLimit);
    const data = { trends };
    attentionCache.set(normalizedLimit, { data, expiresAt: now + CACHE_TTL_MS });
    return data;
}
//# sourceMappingURL=attention.js.map
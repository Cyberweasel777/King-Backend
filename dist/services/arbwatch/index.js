"use strict";
/**
 * ArbWatch service facade for King Backend.
 * Provides scraping + arbitrage detection without requiring DB writes.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOpportunities = getOpportunities;
exports.getMarkets = getMarkets;
const scrapers_1 = require("./scrapers");
const arbitrage_engine_1 = require("./integrations/arbitrage-engine");
const DEFAULT_CACHE_TTL_MS = 60_000;
let cache;
let inFlight = null;
function cacheKey(params) {
    return JSON.stringify({ minProfitPercent: params.minProfitPercent, useDeepseek: params.useDeepseek });
}
async function computeOpportunities(params) {
    try {
        const { results, meta: scraperMeta } = await (0, scrapers_1.scrapeAllWithMeta)();
        const events = {};
        const markets = {};
        for (const [m, r] of Object.entries(results)) {
            events[m] = r.events;
            markets[m] = r.markets;
        }
        const matches = (0, arbitrage_engine_1.matchMarketsAcrossPlatforms)(events, markets);
        const opportunities = params.useDeepseek
            ? await (0, arbitrage_engine_1.detectArbitrageWithStats)(matches, params.minProfitPercent)
            : (0, arbitrage_engine_1.detectArbitrage)(matches, params.minProfitPercent);
        const matchedOutcomes = matches.reduce((sum, m) => sum + (m.matchedOutcomes?.length ?? 0), 0);
        const firstScrapedAt = Object.values(results)[0]?.scrapedAt;
        const baseMeta = {
            markets: Object.keys(results),
            matches: matches.length,
            matchedOutcomes,
            scrapedAt: firstScrapedAt,
            useDeepseek: params.useDeepseek,
            minProfitPercent: params.minProfitPercent,
            scrapers: scraperMeta,
            errors: [],
        };
        return { opportunities, baseMeta };
    }
    catch (error) {
        const msg = error?.message || String(error);
        return {
            opportunities: [],
            baseMeta: {
                markets: (0, scrapers_1.getAvailableScrapers)(),
                matches: 0,
                matchedOutcomes: 0,
                scrapedAt: new Date().toISOString(),
                useDeepseek: params.useDeepseek,
                minProfitPercent: params.minProfitPercent,
                errors: [msg],
            },
        };
    }
}
async function getCachedOrCompute(params) {
    const key = cacheKey(params);
    const now = Date.now();
    if (cache && cache.key === key) {
        const ageMs = now - cache.createdAt;
        if (ageMs < cache.ttlMs) {
            return { opportunities: cache.opportunities, baseMeta: cache.baseMeta, cacheHit: true, ageMs };
        }
    }
    if (!inFlight) {
        inFlight = computeOpportunities({ minProfitPercent: params.minProfitPercent, useDeepseek: params.useDeepseek }).finally(() => {
            inFlight = null;
        });
    }
    const computed = await inFlight;
    cache = {
        key,
        createdAt: now,
        ttlMs: params.ttlMs,
        opportunities: computed.opportunities,
        baseMeta: computed.baseMeta,
    };
    return { opportunities: computed.opportunities, baseMeta: computed.baseMeta, cacheHit: false, ageMs: 0 };
}
async function getOpportunities(params) {
    const minProfitPercent = params?.minProfitPercent ?? 0.5;
    const useDeepseek = params?.useDeepseek ?? true;
    const limit = params?.limit ?? 20;
    const debug = params?.debug ?? false;
    const ttlMs = params?.ttlMs ?? DEFAULT_CACHE_TTL_MS;
    const cached = await getCachedOrCompute({ minProfitPercent, useDeepseek, ttlMs });
    const baseMeta = cached.baseMeta;
    const meta = {
        markets: baseMeta.markets,
        matches: baseMeta.matches,
        matchedOutcomes: baseMeta.matchedOutcomes,
        scrapedAt: baseMeta.scrapedAt,
        useDeepseek,
        minProfitPercent,
        limit,
    };
    if (debug) {
        meta.scrapers = baseMeta.scrapers;
        meta.errors = baseMeta.errors;
        meta.cache = { hit: cached.cacheHit, ageMs: cached.ageMs, ttlMs };
    }
    return {
        opportunities: cached.opportunities.slice(0, limit),
        meta,
    };
}
function getMarkets() {
    return (0, scrapers_1.getAvailableScrapers)();
}
//# sourceMappingURL=index.js.map
"use strict";
/**
 * SkinSignal Service Facade — King Backend
 * CS2 skin arbitrage detection: stateless scraping + in-memory caching.
 * Mirrors the arbwatch service pattern.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOpportunities = getOpportunities;
exports.scanSkin = scanSkin;
exports.getMarkets = getMarkets;
exports.getHotSkins = getHotSkins;
exports.bustCache = bustCache;
const scrapers_1 = require("./scrapers");
const arbitrage_1 = require("./arbitrage");
const hot_skins_1 = require("./hot-skins");
// ── Cache ────────────────────────────────────────────────────────────────────
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1_000; // 5 min (skin prices can move fast)
let cache;
let inFlight = null;
function cacheKey(params) {
    return JSON.stringify(params);
}
// ── Core compute ─────────────────────────────────────────────────────────────
async function computeOpportunities(params) {
    const { minNetSpreadPct, useDeepSeek, skinNames } = params;
    const allOpportunities = [];
    const errors = [];
    let scrapedSkins = 0;
    for (const skinName of skinNames) {
        try {
            const results = await (0, scrapers_1.scrapeAll)(skinName);
            // Collect scraper-level errors
            for (const r of results) {
                if (r.errors?.length)
                    errors.push(...r.errors);
            }
            const opps = await (0, arbitrage_1.detectOpportunities)(results, minNetSpreadPct, useDeepSeek);
            allOpportunities.push(...opps);
            scrapedSkins++;
        }
        catch (err) {
            errors.push(`${skinName}: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    return {
        opportunities: allOpportunities.sort((a, b) => b.netSpreadPct - a.netSpreadPct),
        scrapedSkins,
        scrapedAt: new Date().toISOString(),
        errors: [...new Set(errors)], // deduplicate
    };
}
// ── Cache-aware getter ────────────────────────────────────────────────────────
async function getCachedOrCompute(params) {
    const key = cacheKey({ minNetSpreadPct: params.minNetSpreadPct, useDeepSeek: params.useDeepSeek });
    const now = Date.now();
    if (cache && cache.key === key) {
        const ageMs = now - cache.createdAt;
        if (ageMs < cache.ttlMs) {
            return { data: cache.data, cacheHit: true, ageMs };
        }
    }
    if (!inFlight) {
        inFlight = computeOpportunities(params).finally(() => { inFlight = null; });
    }
    const data = await inFlight;
    cache = { key, createdAt: Date.now(), ttlMs: params.ttlMs, data };
    return { data, cacheHit: false, ageMs: 0 };
}
async function getOpportunities(opts) {
    const minNetSpreadPct = opts?.minNetSpreadPct ?? 5;
    const useDeepSeek = opts?.useDeepSeek ?? true;
    const limit = opts?.limit ?? 20;
    const debug = opts?.debug ?? false;
    const ttlMs = opts?.ttlMs ?? DEFAULT_CACHE_TTL_MS;
    const skinNames = opts?.skinNames ?? (0, hot_skins_1.getHotSkinNames)();
    const { data, cacheHit, ageMs } = await getCachedOrCompute({ minNetSpreadPct, useDeepSeek, skinNames, ttlMs });
    const meta = {
        markets: (0, scrapers_1.getAvailableScrapers)(),
        scrapedSkins: data.scrapedSkins,
        scrapedAt: data.scrapedAt,
        minNetSpreadPct,
        useDeepSeek,
        limit,
        ...(debug ? { cache: { hit: cacheHit, ageMs, ttlMs }, errors: data.errors } : {}),
    };
    return { opportunities: data.opportunities.slice(0, limit), meta };
}
/**
 * On-demand scan of a single skin (bypasses the hot-skin cache).
 */
async function scanSkin(skinName, opts) {
    const useDeepSeek = opts?.useDeepSeek ?? true;
    const minNetSpreadPct = opts?.minNetSpreadPct ?? 0; // return all for single-skin requests
    const results = await (0, scrapers_1.scrapeAll)(skinName);
    const errors = results.flatMap(r => r.errors ?? []);
    const opportunities = await (0, arbitrage_1.detectOpportunities)(results, minNetSpreadPct, useDeepSeek);
    return { skinName, opportunities, errors: [...new Set(errors)], scrapedAt: new Date().toISOString() };
}
function getMarkets() {
    return (0, scrapers_1.getAvailableScrapers)();
}
function getHotSkins() {
    return hot_skins_1.HOT_SKINS;
}
/** Bust the cache (useful after config changes or forced refresh) */
function bustCache() {
    cache = undefined;
}
//# sourceMappingURL=index.js.map
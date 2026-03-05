"use strict";
/**
 * Scraper Index
 * Coordinates all prediction market scrapers
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrapeAll = scrapeAll;
exports.scrapeAllWithMeta = scrapeAllWithMeta;
exports.scrapeMarket = scrapeMarket;
exports.getAvailableScrapers = getAvailableScrapers;
const polymarket_scraper_1 = require("./polymarket-scraper");
const kalshi_scraper_1 = require("./kalshi-scraper");
__exportStar(require("./base-scraper"), exports);
__exportStar(require("./polymarket-scraper"), exports);
__exportStar(require("./kalshi-scraper"), exports);
const activeScrapers = [
    { name: 'polymarket', scraper: new polymarket_scraper_1.PolymarketScraper() },
    { name: 'kalshi', scraper: new kalshi_scraper_1.KalshiScraper() },
];
/**
 * Run all scrapers and return combined results.
 *
 * NOTE: This function is intentionally best-effort: one scraper failing should
 * never prevent others from returning results.
 */
async function scrapeAll() {
    const { results } = await scrapeAllWithMeta();
    return results;
}
/**
 * Run all scrapers and also return per-scraper metadata for debugging.
 */
async function scrapeAllWithMeta() {
    const results = {};
    const meta = {};
    console.log('\n🔍 Starting market scrape...\n');
    for (const { name, scraper } of activeScrapers) {
        const startedAt = Date.now();
        try {
            const result = await scraper.scrape();
            const market = scraper.getMarketplace();
            results[market] = result;
            meta[market] = {
                ok: true,
                count: {
                    events: result.events?.length ?? 0,
                    markets: result.markets?.length ?? 0,
                    oddsSnapshots: result.oddsSnapshots?.length ?? 0,
                },
                durationMs: Date.now() - startedAt,
                errors: result.errors ?? [],
            };
        }
        catch (error) {
            const msg = error?.message || String(error);
            console.error(`Scraper ${name} failed:`, error);
            results[name] = {
                market: name,
                events: [],
                markets: [],
                oddsSnapshots: [],
                errors: [msg],
                scrapedAt: new Date().toISOString(),
            };
            meta[name] = {
                ok: false,
                count: { events: 0, markets: 0, oddsSnapshots: 0 },
                durationMs: Date.now() - startedAt,
                errors: [msg],
            };
        }
    }
    console.log('\n✅ Scraping complete\n');
    return { results: results, meta };
}
/**
 * Scrape a specific market
 */
async function scrapeMarket(market) {
    const entry = activeScrapers.find(s => s.name === market);
    if (!entry || !entry.scraper) {
        throw new Error(`No scraper found for market: ${market}`);
    }
    return entry.scraper.scrape();
}
/**
 * Get available scrapers
 */
function getAvailableScrapers() {
    return activeScrapers.map(s => s.name);
}
//# sourceMappingURL=index.js.map
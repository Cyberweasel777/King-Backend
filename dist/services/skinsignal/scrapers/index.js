"use strict";
/**
 * SkinSignal Scrapers Index — King Backend
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.skinportScraper = exports.buff163Scraper = exports.steamScraper = exports.BaseScraper = void 0;
exports.getAvailableScrapers = getAvailableScrapers;
exports.scrapeAll = scrapeAll;
exports.scrapeOne = scrapeOne;
const steam_scraper_1 = require("./steam-scraper");
const buff163_scraper_1 = require("./buff163-scraper");
const skinport_scraper_1 = require("./skinport-scraper");
var base_scraper_1 = require("./base-scraper");
Object.defineProperty(exports, "BaseScraper", { enumerable: true, get: function () { return base_scraper_1.BaseScraper; } });
var steam_scraper_2 = require("./steam-scraper");
Object.defineProperty(exports, "steamScraper", { enumerable: true, get: function () { return steam_scraper_2.steamScraper; } });
var buff163_scraper_2 = require("./buff163-scraper");
Object.defineProperty(exports, "buff163Scraper", { enumerable: true, get: function () { return buff163_scraper_2.buff163Scraper; } });
var skinport_scraper_2 = require("./skinport-scraper");
Object.defineProperty(exports, "skinportScraper", { enumerable: true, get: function () { return skinport_scraper_2.skinportScraper; } });
const allScrapers = [steam_scraper_1.steamScraper, buff163_scraper_1.buff163Scraper, skinport_scraper_1.skinportScraper];
function getAvailableScrapers() {
    return allScrapers.map(s => s.getMarketplace());
}
/**
 * Run all scrapers in parallel for a given skin name.
 * Best-effort: errors per scraper are captured, not thrown.
 */
async function scrapeAll(skinName) {
    const results = await Promise.allSettled(allScrapers.map(s => s.scrape(skinName)));
    return results.map((r, i) => {
        if (r.status === 'fulfilled')
            return r.value;
        return {
            market: allScrapers[i].getMarketplace(),
            skinName,
            prices: [],
            errors: [r.reason instanceof Error ? r.reason.message : String(r.reason)],
            scrapedAt: new Date().toISOString(),
        };
    });
}
/**
 * Scrape a single marketplace.
 */
async function scrapeOne(market, skinName) {
    const scraper = allScrapers.find(s => s.getMarketplace() === market);
    if (!scraper)
        throw new Error(`Unknown marketplace: ${market}`);
    return scraper.scrape(skinName);
}
//# sourceMappingURL=index.js.map
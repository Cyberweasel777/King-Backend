"use strict";
/**
 * Steam Market Scraper — King Backend SkinSignal
 * Uses Steam Community Market public price-overview endpoint (no auth required)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.steamScraper = exports.SteamMarketScraper = void 0;
const base_scraper_1 = require("./base-scraper");
class SteamMarketScraper extends base_scraper_1.BaseScraper {
    appId = 730; // CS2
    currency = 1; // USD
    constructor() {
        super({
            name: 'steam',
            baseUrl: 'https://steamcommunity.com/market',
            rateLimitMs: 3_000, // Steam rate limit: ~1 req/3s
            maxRetries: 3,
            timeout: 30_000,
        });
    }
    getMarketplace() {
        return 'steam';
    }
    async scrape(skinName) {
        const prices = [];
        const errors = [];
        try {
            const data = await this.withRetry(() => this.request({
                method: 'GET',
                url: `${this.config.baseUrl}/priceoverview/`,
                params: {
                    appid: this.appId,
                    market_hash_name: skinName,
                    currency: this.currency,
                },
            }));
            if (data?.success && data.lowest_price) {
                const price = this.parsePrice(data.lowest_price);
                prices.push({
                    market: 'steam',
                    currency: 'USD',
                    price,
                    priceUsd: price,
                    listingsCount: 0,
                    volume24h: data.volume ? parseInt(data.volume.replace(/,/g, ''), 10) : undefined,
                    fetchedAt: new Date().toISOString(),
                });
            }
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            errors.push(`steam: ${msg}`);
        }
        return { market: 'steam', skinName, prices, errors: errors.length ? errors : undefined, scrapedAt: new Date().toISOString() };
    }
}
exports.SteamMarketScraper = SteamMarketScraper;
exports.steamScraper = new SteamMarketScraper();
//# sourceMappingURL=steam-scraper.js.map
"use strict";
/**
 * Buff163 Scraper — King Backend SkinSignal
 * Unofficial API; requires BUFF163_SESSION cookie for authenticated requests
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buff163Scraper = exports.Buff163Scraper = void 0;
const base_scraper_1 = require("./base-scraper");
class Buff163Scraper extends base_scraper_1.BaseScraper {
    constructor() {
        super({
            name: 'buff163',
            baseUrl: 'https://buff.163.com/api/market',
            rateLimitMs: 2_000,
            maxRetries: 3,
            timeout: 30_000,
        });
        const session = process.env.BUFF163_SESSION;
        if (session) {
            this.client.defaults.headers.common['Cookie'] = session;
        }
    }
    getMarketplace() {
        return 'buff163';
    }
    /** Convert CNY → USD using env-configured rate (default 0.14) */
    cnyToUsd(cny) {
        const rate = parseFloat(process.env.CNY_USD_RATE || '0.14');
        return cny * rate;
    }
    async findGoodsId(skinName) {
        try {
            const resp = await this.withRetry(() => this.request({
                method: 'GET',
                url: `${this.config.baseUrl}/goods`,
                params: { game: 'csgo', page_num: 1, page_size: 80, search: skinName, sort_by: 'price.asc' },
                headers: { Referer: 'https://buff.163.com/market/csgo#tab=selling&page_num=1', 'X-Requested-With': 'XMLHttpRequest' },
            }));
            if (resp.code !== 'ok' || !resp.data)
                return null;
            const items = resp.data.items || resp.data.data || [];
            const exact = items.find(i => i.market_hash_name.toLowerCase() === skinName.toLowerCase());
            return exact?.id ?? items[0]?.id ?? null;
        }
        catch {
            return null;
        }
    }
    async getLowestPrice(goodsId) {
        try {
            const resp = await this.withRetry(() => this.request({
                method: 'GET',
                url: `${this.config.baseUrl}/goods/sell_order`,
                params: { game: 'csgo', goods_id: goodsId, page_num: 1, page_size: 1, sort_by: 'price.asc' },
                headers: { Referer: `https://buff.163.com/goods/${goodsId}`, 'X-Requested-With': 'XMLHttpRequest' },
            }));
            if (resp.code !== 'ok' || !resp.data)
                return null;
            const items = resp.data.items || resp.data.data || [];
            if (!items.length)
                return null;
            return { price: this.parsePrice(items[0].price), count: resp.data.total_count ?? items.length };
        }
        catch {
            return null;
        }
    }
    async scrape(skinName) {
        const prices = [];
        const errors = [];
        if (!process.env.BUFF163_SESSION) {
            return {
                market: 'buff163',
                skinName,
                prices: [],
                errors: ['BUFF163_SESSION env var not set — skipping Buff163'],
                scrapedAt: new Date().toISOString(),
            };
        }
        try {
            const goodsId = await this.findGoodsId(skinName);
            if (!goodsId) {
                errors.push(`buff163: item not found: ${skinName}`);
            }
            else {
                const result = await this.getLowestPrice(goodsId);
                if (result) {
                    prices.push({
                        market: 'buff163',
                        currency: 'CNY',
                        price: result.price,
                        priceUsd: this.cnyToUsd(result.price),
                        listingsCount: result.count,
                        fetchedAt: new Date().toISOString(),
                    });
                }
            }
        }
        catch (err) {
            errors.push(`buff163: ${err instanceof Error ? err.message : String(err)}`);
        }
        return { market: 'buff163', skinName, prices, errors: errors.length ? errors : undefined, scrapedAt: new Date().toISOString() };
    }
}
exports.Buff163Scraper = Buff163Scraper;
exports.buff163Scraper = new Buff163Scraper();
//# sourceMappingURL=buff163-scraper.js.map
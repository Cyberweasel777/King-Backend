"use strict";
/**
 * SkinSignal Base Scraper — King Backend
 * Shared HTTP client with rate-limiting and retry logic
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseScraper = void 0;
const axios_1 = __importDefault(require("axios"));
class BaseScraper {
    config;
    client;
    lastRequestTime = 0;
    constructor(config) {
        this.config = config;
        this.client = axios_1.default.create({
            timeout: config.timeout || 30_000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                Accept: 'application/json, text/plain, */*',
                'Accept-Language': 'en-US,en;q=0.9',
            },
        });
    }
    async rateLimit() {
        const now = Date.now();
        const elapsed = now - this.lastRequestTime;
        if (elapsed < this.config.rateLimitMs) {
            await new Promise(r => setTimeout(r, this.config.rateLimitMs - elapsed));
        }
        this.lastRequestTime = Date.now();
    }
    async withRetry(op, attempts = this.config.maxRetries) {
        try {
            return await op();
        }
        catch (err) {
            if (attempts > 0) {
                const delay = Math.pow(2, this.config.maxRetries - attempts) * 1_000;
                await new Promise(r => setTimeout(r, delay));
                return this.withRetry(op, attempts - 1);
            }
            throw err;
        }
    }
    async request(cfg) {
        await this.rateLimit();
        const res = await this.client.request(cfg);
        return res.data;
    }
    parsePrice(val) {
        if (typeof val === 'number')
            return val;
        return parseFloat(val.replace(/[$,¥€£\s]/g, '')) || 0;
    }
}
exports.BaseScraper = BaseScraper;
//# sourceMappingURL=base-scraper.js.map
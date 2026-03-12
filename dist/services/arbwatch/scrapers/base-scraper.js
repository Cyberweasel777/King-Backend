"use strict";
/**
 * Base Scraper Class
 * Reuses pattern from SpreadHunter/SkinSignal
 * Adapted for prediction markets
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseScraper = void 0;
const axios_1 = __importDefault(require("axios"));
const logger_1 = require("../../../utils/logger");
class BaseScraper {
    config;
    client;
    lastRequestTime = 0;
    constructor(config) {
        this.config = config;
        this.client = axios_1.default.create({
            timeout: config.timeout || 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Origin': config.baseUrl,
                'Referer': config.baseUrl,
            },
        });
    }
    /**
     * Rate limiting - ensure we don't exceed limits
     */
    async rateLimit() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.config.rateLimitMs) {
            const waitTime = this.config.rateLimitMs - timeSinceLastRequest;
            logger_1.logger.debug({ scraper: this.config.name, waitTime }, 'Rate limiting');
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        this.lastRequestTime = Date.now();
    }
    /**
     * Execute with retry logic
     */
    async withRetry(operation, retries = this.config.maxRetries) {
        try {
            return await operation();
        }
        catch (error) {
            if (retries > 0) {
                const delay = Math.pow(2, this.config.maxRetries - retries) * 1000;
                logger_1.logger.warn({ scraper: this.config.name, retry: this.config.maxRetries - retries + 1, maxRetries: this.config.maxRetries, delay }, 'Retrying request');
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.withRetry(operation, retries - 1);
            }
            throw error;
        }
    }
    /**
     * Make HTTP request with rate limiting
     */
    async request(config) {
        await this.rateLimit();
        // Add API key if available
        if (this.config.apiKey) {
            config.headers = {
                ...config.headers,
                'Authorization': `Bearer ${this.config.apiKey}`,
            };
        }
        const response = await this.client.request(config);
        return response.data;
    }
    /**
     * Parse price string to number (0-1 range)
     */
    parsePrice(priceStr) {
        if (typeof priceStr === 'number')
            return priceStr;
        return parseFloat(priceStr) || 0;
    }
    /**
     * Convert cents/decimals to probability (0-1)
     */
    toProbability(value, scale = 'decimal') {
        if (scale === 'cents') {
            return value / 100;
        }
        return Math.max(0, Math.min(1, value));
    }
}
exports.BaseScraper = BaseScraper;
//# sourceMappingURL=base-scraper.js.map
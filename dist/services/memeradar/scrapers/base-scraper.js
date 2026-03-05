"use strict";
/**
 * Base Scraper with Rate Limiting & Retries
 * Pattern from SpreadHunter, adapted for memecoins
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseScraper = void 0;
const logger_1 = require("../shared/logger");
const logger = (0, logger_1.createLogger)('BaseScraper');
class BaseScraper {
    config;
    lastRequestTime = 0;
    constructor(config) {
        this.config = config;
    }
    /**
     * Rate limiting with jitter
     */
    async rateLimit() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.config.rateLimitMs) {
            const waitTime = this.config.rateLimitMs - timeSinceLastRequest;
            // Add jitter (0-20% randomness) to avoid synchronized requests
            const jitter = Math.random() * waitTime * 0.2;
            await new Promise(resolve => setTimeout(resolve, waitTime + jitter));
        }
        this.lastRequestTime = Date.now();
    }
    /**
     * Execute with exponential backoff retry
     */
    async withRetry(operation, retries = this.config.maxRetries) {
        try {
            return await operation();
        }
        catch (error) {
            if (retries > 0) {
                const delay = Math.pow(2, this.config.maxRetries - retries) * 1000;
                logger.warn(`${this.config.name}: Retry ${this.config.maxRetries - retries + 1}/${this.config.maxRetries} after ${delay}ms`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.withRetry(operation, retries - 1);
            }
            throw error;
        }
    }
    /**
     * Fetch with timeout and error handling
     */
    async fetchWithTimeout(url, options) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);
        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            return response;
        }
        catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    }
}
exports.BaseScraper = BaseScraper;
exports.default = BaseScraper;
//# sourceMappingURL=base-scraper.js.map
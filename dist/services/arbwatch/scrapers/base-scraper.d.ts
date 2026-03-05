/**
 * Base Scraper Class
 * Reuses pattern from SpreadHunter/SkinSignal
 * Adapted for prediction markets
 */
import { AxiosInstance, AxiosRequestConfig } from 'axios';
import { ScraperConfig, ScrapeResult, PredictionMarket } from '../types';
export declare abstract class BaseScraper {
    protected config: ScraperConfig;
    protected client: AxiosInstance;
    protected lastRequestTime: number;
    constructor(config: ScraperConfig);
    /**
     * Rate limiting - ensure we don't exceed limits
     */
    protected rateLimit(): Promise<void>;
    /**
     * Execute with retry logic
     */
    protected withRetry<T>(operation: () => Promise<T>, retries?: number): Promise<T>;
    /**
     * Make HTTP request with rate limiting
     */
    protected request<T>(config: AxiosRequestConfig): Promise<T>;
    /**
     * Abstract method for scraping - must be implemented by subclasses
     */
    abstract scrape(): Promise<ScrapeResult>;
    /**
     * Get marketplace identifier
     */
    abstract getMarketplace(): PredictionMarket;
    /**
     * Parse price string to number (0-1 range)
     */
    protected parsePrice(priceStr: string | number): number;
    /**
     * Convert cents/decimals to probability (0-1)
     */
    protected toProbability(value: number, scale?: 'cents' | 'decimal'): number;
}
//# sourceMappingURL=base-scraper.d.ts.map
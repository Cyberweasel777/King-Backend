/**
 * SkinSignal Base Scraper — King Backend
 * Shared HTTP client with rate-limiting and retry logic
 */
import { AxiosInstance, AxiosRequestConfig } from 'axios';
import { Marketplace, ScrapeResult } from '../types';
export interface ScraperConfig {
    name: string;
    baseUrl: string;
    rateLimitMs: number;
    maxRetries: number;
    timeout?: number;
}
export declare abstract class BaseScraper {
    protected config: ScraperConfig;
    protected client: AxiosInstance;
    private lastRequestTime;
    constructor(config: ScraperConfig);
    protected rateLimit(): Promise<void>;
    protected withRetry<T>(op: () => Promise<T>, attempts?: number): Promise<T>;
    protected request<T>(cfg: AxiosRequestConfig): Promise<T>;
    protected parsePrice(val: string | number): number;
    abstract getMarketplace(): Marketplace;
    abstract scrape(skinName: string): Promise<ScrapeResult>;
}
//# sourceMappingURL=base-scraper.d.ts.map
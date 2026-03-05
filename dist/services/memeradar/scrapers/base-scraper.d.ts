/**
 * Base Scraper with Rate Limiting & Retries
 * Pattern from SpreadHunter, adapted for memecoins
 */
import { ScraperConfig } from '../shared/types';
export declare abstract class BaseScraper {
    protected config: ScraperConfig;
    protected lastRequestTime: number;
    constructor(config: ScraperConfig);
    /**
     * Rate limiting with jitter
     */
    protected rateLimit(): Promise<void>;
    /**
     * Execute with exponential backoff retry
     */
    protected withRetry<T>(operation: () => Promise<T>, retries?: number): Promise<T>;
    /**
     * Fetch with timeout and error handling
     */
    protected fetchWithTimeout(url: string, options?: RequestInit): Promise<Response>;
    /**
     * Platform-specific scrape method (must implement)
     */
    abstract scrape(): Promise<any>;
}
export default BaseScraper;
//# sourceMappingURL=base-scraper.d.ts.map
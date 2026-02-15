/**
 * Base Scraper with Rate Limiting & Retries
 * Pattern from SpreadHunter, adapted for memecoins
 */

import { ScraperConfig } from '../shared/types';
import { createLogger } from '../shared/logger';

const logger = createLogger('BaseScraper');

export abstract class BaseScraper {
  protected config: ScraperConfig;
  protected lastRequestTime: number = 0;

  constructor(config: ScraperConfig) {
    this.config = config;
  }

  /**
   * Rate limiting with jitter
   */
  protected async rateLimit(): Promise<void> {
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
  protected async withRetry<T>(
    operation: () => Promise<T>,
    retries: number = this.config.maxRetries
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
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
  protected async fetchWithTimeout(url: string, options?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Platform-specific scrape method (must implement)
   */
  abstract scrape(): Promise<any>;
}

export default BaseScraper;

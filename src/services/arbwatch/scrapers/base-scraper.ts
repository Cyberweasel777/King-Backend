/**
 * Base Scraper Class
 * Reuses pattern from SpreadHunter/SkinSignal
 * Adapted for prediction markets
 */

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { ScraperConfig, ScrapeResult, PredictionMarket } from '../types';

export abstract class BaseScraper {
  protected config: ScraperConfig;
  protected client: AxiosInstance;
  protected lastRequestTime: number = 0;

  constructor(config: ScraperConfig) {
    this.config = config;
    this.client = axios.create({
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
  protected async rateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.config.rateLimitMs) {
      const waitTime = this.config.rateLimitMs - timeSinceLastRequest;
      console.log(`${this.config.name}: Rate limiting - waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }

  /**
   * Execute with retry logic
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
        console.warn(`${this.config.name}: Retry ${this.config.maxRetries - retries + 1}/${this.config.maxRetries} after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.withRetry(operation, retries - 1);
      }
      throw error;
    }
  }

  /**
   * Make HTTP request with rate limiting
   */
  protected async request<T>(config: AxiosRequestConfig): Promise<T> {
    await this.rateLimit();
    
    // Add API key if available
    if (this.config.apiKey) {
      config.headers = {
        ...config.headers,
        'Authorization': `Bearer ${this.config.apiKey}`,
      };
    }
    
    const response = await this.client.request<T>(config);
    return response.data;
  }

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
  protected parsePrice(priceStr: string | number): number {
    if (typeof priceStr === 'number') return priceStr;
    return parseFloat(priceStr) || 0;
  }

  /**
   * Convert cents/decimals to probability (0-1)
   */
  protected toProbability(value: number, scale: 'cents' | 'decimal' = 'decimal'): number {
    if (scale === 'cents') {
      return value / 100;
    }
    return Math.max(0, Math.min(1, value));
  }
}

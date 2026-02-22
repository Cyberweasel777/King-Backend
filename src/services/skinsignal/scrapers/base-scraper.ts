/**
 * SkinSignal Base Scraper — King Backend
 * Shared HTTP client with rate-limiting and retry logic
 */

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { Marketplace, ScrapeResult } from '../types';

export interface ScraperConfig {
  name: string;
  baseUrl: string;
  rateLimitMs: number;
  maxRetries: number;
  timeout?: number;
}

export abstract class BaseScraper {
  protected config: ScraperConfig;
  protected client: AxiosInstance;
  private lastRequestTime: number = 0;

  constructor(config: ScraperConfig) {
    this.config = config;
    this.client = axios.create({
      timeout: config.timeout || 30_000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
  }

  protected async rateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.config.rateLimitMs) {
      await new Promise(r => setTimeout(r, this.config.rateLimitMs - elapsed));
    }
    this.lastRequestTime = Date.now();
  }

  protected async withRetry<T>(op: () => Promise<T>, attempts = this.config.maxRetries): Promise<T> {
    try {
      return await op();
    } catch (err) {
      if (attempts > 0) {
        const delay = Math.pow(2, this.config.maxRetries - attempts) * 1_000;
        await new Promise(r => setTimeout(r, delay));
        return this.withRetry(op, attempts - 1);
      }
      throw err;
    }
  }

  protected async request<T>(cfg: AxiosRequestConfig): Promise<T> {
    await this.rateLimit();
    const res = await this.client.request<T>(cfg);
    return res.data;
  }

  protected parsePrice(val: string | number): number {
    if (typeof val === 'number') return val;
    return parseFloat(val.replace(/[$,¥€£\s]/g, '')) || 0;
  }

  abstract getMarketplace(): Marketplace;
  abstract scrape(skinName: string): Promise<ScrapeResult>;
}

/**
 * Skinport Scraper — King Backend SkinSignal
 * Uses the official Skinport public API (no auth required for /v1/items)
 * https://docs.skinport.com/
 */

import { BaseScraper } from './base-scraper';
import { Marketplace, ScrapeResult, SkinPrice } from '../types';

interface SkinportItem {
  market_hash_name: string;
  currency: string;
  suggested_price: number;
  min_price: number | null;
  quantity: number;
}

export class SkinportScraper extends BaseScraper {
  constructor() {
    super({
      name: 'skinport',
      baseUrl: 'https://api.skinport.com/v1',
      rateLimitMs: 1_000,
      maxRetries: 3,
      timeout: 30_000,
    });
  }

  getMarketplace(): Marketplace {
    return 'skinport';
  }

  private getAuthHeaders(): Record<string, string> {
    const key = process.env.SKINPORT_API_KEY;
    const secret = process.env.SKINPORT_API_SECRET;
    if (!key || !secret) return {};
    return {
      Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`,
    };
  }

  async scrape(skinName: string): Promise<ScrapeResult> {
    const prices: SkinPrice[] = [];
    const errors: string[] = [];

    try {
      const items = await this.withRetry(() =>
        this.request<SkinportItem[]>({
          method: 'GET',
          url: `${this.config.baseUrl}/items`,
          params: { app_id: 730, currency: 'USD', tradable: 1 },
          headers: this.getAuthHeaders(),
        }),
      );

      const match = (items || []).find(
        i => i.market_hash_name.toLowerCase() === skinName.toLowerCase(),
      );

      if (match) {
        const price = match.min_price ?? match.suggested_price;
        prices.push({
          market: 'skinport',
          currency: match.currency || 'USD',
          price,
          priceUsd: price,
          listingsCount: match.quantity,
          fetchedAt: new Date().toISOString(),
        });
      } else {
        errors.push(`skinport: item not found: ${skinName}`);
      }
    } catch (err) {
      errors.push(`skinport: ${err instanceof Error ? err.message : String(err)}`);
    }

    return { market: 'skinport', skinName, prices, errors: errors.length ? errors : undefined, scrapedAt: new Date().toISOString() };
  }
}

export const skinportScraper = new SkinportScraper();

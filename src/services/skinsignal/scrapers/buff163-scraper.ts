/**
 * Buff163 Scraper — King Backend SkinSignal
 * Unofficial API; requires BUFF163_SESSION cookie for authenticated requests
 */

import { BaseScraper } from './base-scraper';
import { Marketplace, ScrapeResult, SkinPrice } from '../types';

interface BuffGoodsItem {
  id: number;
  market_hash_name: string;
  sell_min_price: string;
  sell_num: number;
}

interface BuffSellOrder {
  id: string;
  price: string;
}

interface BuffResponse<T> {
  code: string;
  data?: { items?: T[]; data?: T[]; total_count?: number };
  error?: string;
}

export class Buff163Scraper extends BaseScraper {
  constructor() {
    super({
      name: 'buff163',
      baseUrl: 'https://buff.163.com/api/market',
      rateLimitMs: 2_000,
      maxRetries: 3,
      timeout: 30_000,
    });

    const session = process.env.BUFF163_SESSION;
    if (session) {
      this.client.defaults.headers.common['Cookie'] = session;
    }
  }

  getMarketplace(): Marketplace {
    return 'buff163';
  }

  /** Convert CNY → USD using env-configured rate (default 0.14) */
  private cnyToUsd(cny: number): number {
    const rate = parseFloat(process.env.CNY_USD_RATE || '0.14');
    return cny * rate;
  }

  private async findGoodsId(skinName: string): Promise<number | null> {
    try {
      const resp = await this.withRetry(() =>
        this.request<BuffResponse<BuffGoodsItem>>({
          method: 'GET',
          url: `${this.config.baseUrl}/goods`,
          params: { game: 'csgo', page_num: 1, page_size: 80, search: skinName, sort_by: 'price.asc' },
          headers: { Referer: 'https://buff.163.com/market/csgo#tab=selling&page_num=1', 'X-Requested-With': 'XMLHttpRequest' },
        }),
      );
      if (resp.code !== 'ok' || !resp.data) return null;
      const items = resp.data.items || resp.data.data || [];
      const exact = items.find(i => i.market_hash_name.toLowerCase() === skinName.toLowerCase());
      return exact?.id ?? items[0]?.id ?? null;
    } catch {
      return null;
    }
  }

  private async getLowestPrice(goodsId: number): Promise<{ price: number; count: number } | null> {
    try {
      const resp = await this.withRetry(() =>
        this.request<BuffResponse<BuffSellOrder>>({
          method: 'GET',
          url: `${this.config.baseUrl}/goods/sell_order`,
          params: { game: 'csgo', goods_id: goodsId, page_num: 1, page_size: 1, sort_by: 'price.asc' },
          headers: { Referer: `https://buff.163.com/goods/${goodsId}`, 'X-Requested-With': 'XMLHttpRequest' },
        }),
      );
      if (resp.code !== 'ok' || !resp.data) return null;
      const items = resp.data.items || resp.data.data || [];
      if (!items.length) return null;
      return { price: this.parsePrice(items[0].price), count: resp.data.total_count ?? items.length };
    } catch {
      return null;
    }
  }

  async scrape(skinName: string): Promise<ScrapeResult> {
    const prices: SkinPrice[] = [];
    const errors: string[] = [];

    if (!process.env.BUFF163_SESSION) {
      return {
        market: 'buff163',
        skinName,
        prices: [],
        errors: ['BUFF163_SESSION env var not set — skipping Buff163'],
        scrapedAt: new Date().toISOString(),
      };
    }

    try {
      const goodsId = await this.findGoodsId(skinName);
      if (!goodsId) {
        errors.push(`buff163: item not found: ${skinName}`);
      } else {
        const result = await this.getLowestPrice(goodsId);
        if (result) {
          prices.push({
            market: 'buff163',
            currency: 'CNY',
            price: result.price,
            priceUsd: this.cnyToUsd(result.price),
            listingsCount: result.count,
            fetchedAt: new Date().toISOString(),
          });
        }
      }
    } catch (err) {
      errors.push(`buff163: ${err instanceof Error ? err.message : String(err)}`);
    }

    return { market: 'buff163', skinName, prices, errors: errors.length ? errors : undefined, scrapedAt: new Date().toISOString() };
  }
}

export const buff163Scraper = new Buff163Scraper();

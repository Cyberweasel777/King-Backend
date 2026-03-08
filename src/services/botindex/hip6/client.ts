import logger from '../../../config/logger';
import { HIP6AuctionState, HIP6Bid, HIP6ClearingEvent } from './types';

const HIP6_CACHE_TTL_MS = 2 * 60 * 1000;

type CachedValue<T> = {
  value: T;
  expiresAt: number;
};

export class HIP6Client {
  private readonly cache = new Map<string, CachedValue<unknown>>();

  isLive(): boolean {
    return String(process.env.HIP6_LIVE ?? '').toLowerCase() === 'true';
  }

  async getActiveAuctions(): Promise<HIP6AuctionState[]> {
    logger.warn('HIP-6 not yet live — returning stub data');

    if (!this.isLive()) {
      return [];
    }

    const cacheKey = 'hip6:auctions:active';
    const cached = this.getFromCache<HIP6AuctionState[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // TODO: Query Hyperliquid info endpoint for active HIP-6 auctions.
    const auctions: HIP6AuctionState[] = [];
    this.setCache(cacheKey, auctions);
    return auctions;
  }

  async getAuctionDetails(auctionId: string): Promise<HIP6AuctionState | null> {
    logger.warn('HIP-6 not yet live — returning stub data');

    if (!this.isLive()) {
      return null;
    }

    const normalizedAuctionId = auctionId.trim();
    const cacheKey = `hip6:auction:details:${normalizedAuctionId}`;
    const cached = this.getFromCache<HIP6AuctionState | null>(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    // TODO: Query Hyperliquid info endpoint for the specific HIP-6 auction.
    const auction: HIP6AuctionState | null = null;
    this.setCache(cacheKey, auction);
    return auction;
  }

  async getAuctionBids(auctionId: string): Promise<HIP6Bid[]> {
    logger.warn('HIP-6 not yet live — returning stub data');

    if (!this.isLive()) {
      return [];
    }

    const normalizedAuctionId = auctionId.trim();
    const cacheKey = `hip6:auction:bids:${normalizedAuctionId}`;
    const cached = this.getFromCache<HIP6Bid[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // TODO: Query Hyperliquid bid book endpoint for auction bids.
    const bids: HIP6Bid[] = [];
    this.setCache(cacheKey, bids);
    return bids;
  }

  async getClearingHistory(auctionId: string, limit = 100): Promise<HIP6ClearingEvent[]> {
    logger.warn('HIP-6 not yet live — returning stub data');

    if (!this.isLive()) {
      return [];
    }

    const normalizedAuctionId = auctionId.trim();
    const boundedLimit = Math.max(1, Math.min(1000, Math.floor(limit)));
    const cacheKey = `hip6:auction:clearing:${normalizedAuctionId}:${boundedLimit}`;
    const cached = this.getFromCache<HIP6ClearingEvent[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // TODO: Query Hyperliquid clearing event endpoint for historical auction clears.
    const events: HIP6ClearingEvent[] = [];
    this.setCache(cacheKey, events);
    return events;
  }

  private getFromCache<T>(key: string): T | undefined {
    const hit = this.cache.get(key);
    if (!hit) {
      return undefined;
    }

    if (hit.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return undefined;
    }

    return hit.value as T;
  }

  private setCache<T>(key: string, value: T): void {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + HIP6_CACHE_TTL_MS,
    });
  }
}

export const hip6Client = new HIP6Client();

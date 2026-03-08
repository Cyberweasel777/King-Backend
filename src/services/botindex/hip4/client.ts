import logger from '../../../config/logger';
import { HIP4OutcomeContract, HIP4OutcomeMarket, HIP4Position, HIP4SettlementSource } from './types';

const HIP4_CACHE_TTL_MS = 2 * 60 * 1000;
const HIP4_NOT_LIVE_WARNING = 'HIP-4 not yet live on mainnet — returning stub data';

type CachedValue<T> = {
  value: T;
  expiresAt: number;
};

export class HIP4Client {
  private readonly cache = new Map<string, CachedValue<unknown>>();

  isLive(): boolean {
    return String(process.env.HIP4_LIVE ?? '').toLowerCase() === 'true';
  }

  async getActiveMarkets(): Promise<HIP4OutcomeMarket[]> {
    if (!this.isLive()) {
      logger.warn(HIP4_NOT_LIVE_WARNING);
      return [];
    }

    const cacheKey = 'hip4:markets:active';
    const cached = this.getFromCache<HIP4OutcomeMarket[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // TODO: Query Hyperliquid info API for active HIP-4 outcome markets.
    const markets: HIP4OutcomeMarket[] = [];
    this.setCache(cacheKey, markets);
    return markets;
  }

  async getMarketDetails(marketId: string): Promise<HIP4OutcomeMarket | null> {
    if (!this.isLive()) {
      logger.warn(HIP4_NOT_LIVE_WARNING);
      return null;
    }

    const normalizedMarketId = marketId.trim();
    const cacheKey = `hip4:market:details:${normalizedMarketId}`;
    const cached = this.getFromCache<HIP4OutcomeMarket | null>(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    // TODO: Query Hyperliquid info API for a specific HIP-4 outcome market.
    const market: HIP4OutcomeMarket | null = null;
    this.setCache(cacheKey, market);
    return market;
  }

  async getPositions(marketId: string): Promise<HIP4Position[]> {
    if (!this.isLive()) {
      logger.warn(HIP4_NOT_LIVE_WARNING);
      return [];
    }

    const normalizedMarketId = marketId.trim();
    const cacheKey = `hip4:market:positions:${normalizedMarketId}`;
    const cached = this.getFromCache<HIP4Position[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // TODO: Query Hyperliquid positions API for HIP-4 market positions.
    const positions: HIP4Position[] = [];
    this.setCache(cacheKey, positions);
    return positions;
  }

  async getSettlementStatus(
    marketId: string
  ): Promise<{ source: HIP4SettlementSource | null; contract: HIP4OutcomeContract | null }> {
    if (!this.isLive()) {
      logger.warn(HIP4_NOT_LIVE_WARNING);
      return { source: null, contract: null };
    }

    const normalizedMarketId = marketId.trim();
    const cacheKey = `hip4:market:settlement:${normalizedMarketId}`;
    const cached = this.getFromCache<{ source: HIP4SettlementSource | null; contract: HIP4OutcomeContract | null }>(
      cacheKey
    );
    if (cached) {
      return cached;
    }

    // TODO: Query Hyperliquid settlement oracle/status API for HIP-4 market settlement state.
    const settlement = { source: null, contract: null };
    this.setCache(cacheKey, settlement);
    return settlement;
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
      expiresAt: Date.now() + HIP4_CACHE_TTL_MS,
    });
  }
}

export const hip4Client = new HIP4Client();

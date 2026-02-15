/**
 * DexScreener Scraper
 * Fetches trending tokens, pair data, and price updates
 * API: https://docs.dexscreener.com/api/reference
 */

import { BaseScraper } from './base-scraper';
import { TokenData, TrendingToken } from '../shared/types';
import { createLogger } from '../shared/logger';
import { priceCache, tokenCache } from '../shared/cache';

const logger = createLogger('DexScreener');

interface DexScreenerPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  quoteToken: {
    address: string;
    name: string;
    symbol: string;
  };
  priceNative: string;
  priceUsd: string;
  txns: {
    m5: { buys: number; sells: number };
    h1: { buys: number; sells: number };
    h6: { buys: number; sells: number };
    h24: { buys: number; sells: number };
  };
  volume: {
    h24: number;
    h6: number;
    h1: number;
    m5: number;
  };
  priceChange: {
    m5: number;
    h1: number;
    h6: number;
    h24: number;
  };
  liquidity: {
    usd: number;
    base: number;
    quote: number;
  };
  fdv: number;
  marketCap: number;
  pairCreatedAt: number;
  info?: {
    imageUrl?: string;
    websites?: { label: string; url: string }[];
    socials?: { type: string; url: string }[];
  };
}

interface DexScreenerResponse {
  pairs?: DexScreenerPair[];
}

interface TokenProfile {
  tokenAddress: string;
  chainId: string;
}

type TokenProfileLite = {
  address: string;
  chain: string;
};

export class DexScreenerScraper extends BaseScraper {
  private baseUrl = 'https://api.dexscreener.com/latest';

  constructor() {
    super({
      name: 'DexScreener',
      rateLimitMs: 1000, // 1 second between requests
      maxRetries: 3,
      timeoutMs: 10000,
    });
  }

  /**
   * Get trending tokens on Solana
   */
  async getTrendingSolana(limit: number = 20): Promise<TrendingToken[]> {
    const cacheKey = `dexscreener:trending:solana:${limit}`;
    const cached = priceCache.get<TrendingToken[]>(cacheKey);
    if (cached) {
      logger.debug('Cache hit for trending Solana tokens');
      return cached;
    }

    logger.info('Fetching trending Solana tokens');

    try {
      // DexScreener doesn't expose a clean "trending Solana memecoins" endpoint.
      // Best-effort approach:
      //  1) Pull latest token profiles (boosted/promoted)
      //  2) Filter to Solana
      //  3) Fetch token details via /dex/tokens/{address}
      const profiles = await this.getTokenProfiles();

      const solana = profiles.filter((t) => t.chain === 'solana').slice(0, limit * 2);

      const enriched: TokenData[] = [];
      for (const t of solana) {
        const full = await this.getTokenByAddress(t.address, 'solana');
        if (full) enriched.push(full);
        if (enriched.length >= limit) break;
      }

      // Convert to TrendingToken
      const memecoins: TrendingToken[] = enriched.map((token, i) => ({
        rank: i + 1,
        token,
        trendingScore: (token.volume24h || 0) + (token.liquidityUsd || 0) + Math.abs(token.priceChange24h || 0) * 1000,
      }));

      priceCache.set(cacheKey, memecoins, 60000); // 1 minute cache
      logger.info(`Found ${memecoins.length} trending Solana memecoins (profiles-based)`);

      return memecoins;
    } catch (error) {
      logger.error('Failed to fetch trending tokens', error);
      return this.getMockTrending(limit);
    }
  }

  /**
   * Get token data by address
   */
  async getTokenByAddress(address: string, chain: string = 'solana'): Promise<TokenData | null> {
    const cacheKey = `dexscreener:token:${chain}:${address}`;
    const cached = tokenCache.get<TokenData>(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.withRetry(async () => {
        await this.rateLimit();
        const res = await this.fetchWithTimeout(
          `${this.baseUrl}/dex/tokens/${address}`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res;
      });

      const data = await response.json() as DexScreenerResponse;
      const pairs: DexScreenerPair[] = data.pairs || [];

      if (pairs.length === 0) return null;

      // Choose "best" pair. DexScreener token results can include multiple pools across DEXes,
      // and some entries are missing liquidity/volume/txns fields.
      const scorePair = (p: DexScreenerPair): number => {
        const liquidityUsd = p?.liquidity?.usd || 0;
        const volume24h = p?.volume?.h24 || 0;
        const buys = p?.txns?.h24?.buys || 0;
        const sells = p?.txns?.h24?.sells || 0;

        const hasLiquidity = typeof p?.liquidity?.usd === 'number';
        const hasVolume = typeof p?.volume?.h24 === 'number';
        const hasTxns = typeof p?.txns?.h24?.buys === 'number' && typeof p?.txns?.h24?.sells === 'number';

        // We care primarily about: real liquidity, then real volume, then activity.
        // Field-presence bonuses prevent selecting sparse rows.
        return (
          (hasLiquidity ? 1_000_000 : 0) +
          Math.log10(liquidityUsd + 1) * 10_000 +
          (hasVolume ? 100_000 : 0) +
          Math.log10(volume24h + 1) * 5_000 +
          (hasTxns ? 10_000 : 0) +
          (buys + sells)
        );
      };

      const bestPair = pairs.slice().sort((a, b) => scorePair(b) - scorePair(a))[0];
      if (!bestPair) return null;

      const token = this.transformToTokenData(bestPair, chain);

      tokenCache.set(cacheKey, token, 300000); // 5 minute cache
      return token;
    } catch (error) {
      logger.error(`Failed to fetch token ${address}`, error);
      return null;
    }
  }

  /**
   * Search for tokens by symbol or name
   */
  async searchTokens(query: string): Promise<TokenData[]> {
    try {
      const response = await this.withRetry(async () => {
        await this.rateLimit();
        const res = await this.fetchWithTimeout(
          `${this.baseUrl}/dex/search?q=${encodeURIComponent(query)}`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res;
      });

      const data = await response.json() as DexScreenerResponse;
      const pairs: DexScreenerPair[] = data.pairs || [];

      return pairs
        .filter(p => p.chainId === 'solana' || p.chainId === 'base')
        .slice(0, 10)
        .map(p => this.transformToTokenData(p, p.chainId));
    } catch (error) {
      logger.error('Search failed', error);
      return [];
    }
  }

  /**
   * Get latest token profiles (boosted/promoted)
   */
  async getTokenProfiles(): Promise<TokenProfileLite[]> {
    try {
      const response = await this.withRetry(async () => {
        await this.rateLimit();
        // NOTE: token-profiles is NOT under /latest.
        const res = await this.fetchWithTimeout(
          `https://api.dexscreener.com/token-profiles/latest/v1`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res;
      });

      const profiles = await response.json() as TokenProfile[];
      logger.info(`Fetched ${profiles.length} token profiles`);

      return profiles
        .filter((p) => p && p.tokenAddress && p.chainId)
        .map((p) => ({ address: p.tokenAddress, chain: p.chainId }));
    } catch (error) {
      logger.error('Failed to fetch token profiles', error);
      return [];
    }
  }

  /**
   * Main scrape method (for scheduled runs)
   */
  async scrape(): Promise<{ trending: TrendingToken[]; profiles: TokenProfileLite[] }> {
    const [trending, profiles] = await Promise.all([
      this.getTrendingSolana(20),
      this.getTokenProfiles(),
    ]);

    return { trending, profiles };
  }

  // Helper methods
  private filterMemecoins(pairs: DexScreenerPair[], chain: string): DexScreenerPair[] {
    const excludedSymbols = ['USDC', 'USDT', 'SOL', 'ETH', 'BTC', 'WBTC', 'WETH', 'WSOL'];
    
    return pairs.filter(p => {
      // Must be on requested chain
      if (p.chainId !== chain) return false;
      
      // Exclude major stablecoins/tokens
      if (excludedSymbols.includes(p.baseToken.symbol.toUpperCase())) return false;
      
      // Minimum liquidity threshold for memecoins ($1K)
      if (p.liquidity.usd < 1000) return false;
      
      // Must have some volume
      if (p.volume.h24 < 100) return false;
      
      return true;
    });
  }

  private transformToTrending(pair: DexScreenerPair, rank: number): TrendingToken {
    return {
      rank,
      token: this.transformToTokenData(pair, pair.chainId),
      trendingScore: this.calculateTrendingScore(pair),
    };
  }

  private transformToTokenData(pair: DexScreenerPair, chain: string): TokenData {
    const warnings: string[] = [];
    if (pair?.liquidity?.usd == null) warnings.push('missing_liquidity');
    if (pair?.volume?.h24 == null) warnings.push('missing_volume24h');
    if (pair?.priceChange?.h24 == null) warnings.push('missing_priceChange24h');
    if (pair?.priceChange?.h1 == null) warnings.push('missing_priceChange1h');
    if (pair?.txns?.h24 == null) warnings.push('missing_txns24h');

    return {
      address: pair.baseToken.address,
      symbol: pair.baseToken.symbol,
      name: pair.baseToken.name,
      chain: chain as any,
      priceUsd: parseFloat(pair.priceUsd) || 0,
      marketCap: pair.marketCap || pair.fdv || 0,
      liquidityUsd: pair?.liquidity?.usd || 0,
      volume24h: pair?.volume?.h24 || 0,
      priceChange24h: pair?.priceChange?.h24 || 0,
      priceChange1h: pair?.priceChange?.h1 || 0,
      holders: 0, // DexScreener doesn't provide this
      timestamp: new Date().toISOString(),
      dexUrl: `https://dexscreener.com/${pair.chainId}/${pair.pairAddress}`,
      metadata: {
        createdAt: pair.pairCreatedAt ? new Date(pair.pairCreatedAt).toISOString() : undefined,
        warnings: warnings.length ? warnings : undefined,
      },
    };
  }

  private calculateTrendingScore(pair: DexScreenerPair): number {
    // Simple trending score based on volume, price change, and liquidity
    const volume24h = pair?.volume?.h24 || 0;
    const priceChange24h = pair?.priceChange?.h24 || 0;
    const liquidityUsd = pair?.liquidity?.usd || 0;
    const buys = pair?.txns?.h24?.buys || 0;
    const sells = pair?.txns?.h24?.sells || 0;

    const volumeScore = Math.log10(volume24h + 1) * 10;
    const priceChangeScore = Math.abs(priceChange24h) * 2;
    const liquidityScore = Math.log10(liquidityUsd + 1) * 5;
    const activityScore = (buys + sells) / 100;
    
    return Math.round(volumeScore + priceChangeScore + liquidityScore + activityScore);
  }

  private getMockTrending(limit: number): TrendingToken[] {
    // Mock data for testing when API fails
    return Array.from({ length: limit }, (_, i) => ({
      rank: i + 1,
      token: {
        address: `mock${i}`,
        symbol: `MOCK${i}`,
        name: `Mock Token ${i}`,
        chain: 'solana' as const,
        priceUsd: Math.random() * 0.01,
        marketCap: Math.random() * 1000000,
        liquidityUsd: Math.random() * 100000,
        volume24h: Math.random() * 50000,
        priceChange24h: (Math.random() - 0.5) * 100,
        priceChange1h: (Math.random() - 0.5) * 20,
        holders: Math.floor(Math.random() * 10000),
        timestamp: new Date().toISOString(),
        dexUrl: 'https://dexscreener.com',
      },
      trendingScore: Math.floor(Math.random() * 100),
    }));
  }
}

export default DexScreenerScraper;

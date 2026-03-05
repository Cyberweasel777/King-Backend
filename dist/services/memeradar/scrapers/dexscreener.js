"use strict";
/**
 * DexScreener Scraper
 * Fetches trending tokens, pair data, and price updates
 * API: https://docs.dexscreener.com/api/reference
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DexScreenerScraper = void 0;
const base_scraper_1 = require("./base-scraper");
const logger_1 = require("../shared/logger");
const cache_1 = require("../shared/cache");
const logger = (0, logger_1.createLogger)('DexScreener');
class DexScreenerScraper extends base_scraper_1.BaseScraper {
    baseUrl = 'https://api.dexscreener.com/latest';
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
    async getTrendingSolana(limit = 20) {
        const cacheKey = `dexscreener:trending:solana:${limit}`;
        const cached = cache_1.priceCache.get(cacheKey);
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
            const enriched = [];
            for (const t of solana) {
                const full = await this.getTokenByAddress(t.address, 'solana');
                if (full)
                    enriched.push(full);
                if (enriched.length >= limit)
                    break;
            }
            // Convert to TrendingToken
            const memecoins = enriched.map((token, i) => ({
                rank: i + 1,
                token,
                trendingScore: (token.volume24h || 0) + (token.liquidityUsd || 0) + Math.abs(token.priceChange24h || 0) * 1000,
            }));
            cache_1.priceCache.set(cacheKey, memecoins, 60000); // 1 minute cache
            logger.info(`Found ${memecoins.length} trending Solana memecoins (profiles-based)`);
            return memecoins;
        }
        catch (error) {
            logger.error('Failed to fetch trending tokens', error);
            return this.getMockTrending(limit);
        }
    }
    /**
     * Get token data by address
     */
    async getTokenByAddress(address, chain = 'solana') {
        const cacheKey = `dexscreener:token:${chain}:${address}`;
        const cached = cache_1.tokenCache.get(cacheKey);
        if (cached)
            return cached;
        try {
            const response = await this.withRetry(async () => {
                await this.rateLimit();
                const res = await this.fetchWithTimeout(`${this.baseUrl}/dex/tokens/${address}`);
                if (!res.ok)
                    throw new Error(`HTTP ${res.status}`);
                return res;
            });
            const data = (await response.json());
            const pairs = data.pairs || [];
            if (pairs.length === 0)
                return null;
            // Choose "best" pair. DexScreener token results can include multiple pools across DEXes,
            // and some entries are missing liquidity/volume/txns fields.
            const scorePair = (p) => {
                const liquidityUsd = p?.liquidity?.usd || 0;
                const volume24h = p?.volume?.h24 || 0;
                const buys = p?.txns?.h24?.buys || 0;
                const sells = p?.txns?.h24?.sells || 0;
                const hasLiquidity = typeof p?.liquidity?.usd === 'number';
                const hasVolume = typeof p?.volume?.h24 === 'number';
                const hasTxns = typeof p?.txns?.h24?.buys === 'number' && typeof p?.txns?.h24?.sells === 'number';
                // We care primarily about: real liquidity, then real volume, then activity.
                // Field-presence bonuses prevent selecting sparse rows.
                return ((hasLiquidity ? 1_000_000 : 0) +
                    Math.log10(liquidityUsd + 1) * 10_000 +
                    (hasVolume ? 100_000 : 0) +
                    Math.log10(volume24h + 1) * 5_000 +
                    (hasTxns ? 10_000 : 0) +
                    buys +
                    sells);
            };
            const bestPair = pairs.slice().sort((a, b) => scorePair(b) - scorePair(a))[0];
            if (!bestPair)
                return null;
            // Transform.
            const token = this.transformToTokenData(bestPair, chain);
            // Fallback hydration: if liquidity is missing/zero, try the pair endpoint once.
            // This helps for very new pools where /dex/tokens response is sparse.
            if ((token.metadata?.warnings || []).includes('missing_liquidity') && bestPair?.pairAddress) {
                const hydrated = await this.hydratePairLiquidity(chain, bestPair.pairAddress);
                if (hydrated?.liquidityUsd && hydrated.liquidityUsd > 0) {
                    token.liquidityUsd = hydrated.liquidityUsd;
                    // remove warning
                    const next = (token.metadata?.warnings || []).filter((w) => w !== 'missing_liquidity');
                    token.metadata = { ...(token.metadata || {}), warnings: next.length ? next : undefined };
                }
                else {
                    token.metadata = {
                        ...(token.metadata || {}),
                        warnings: Array.from(new Set([...(token.metadata?.warnings || []), 'pair_liquidity_unavailable'])),
                    };
                }
            }
            cache_1.tokenCache.set(cacheKey, token, 300000); // 5 minute cache
            return token;
        }
        catch (error) {
            logger.error(`Failed to fetch token ${address}`, error);
            return null;
        }
    }
    /**
     * Search for tokens by symbol or name
     */
    async searchTokens(query) {
        try {
            const response = await this.withRetry(async () => {
                await this.rateLimit();
                const res = await this.fetchWithTimeout(`${this.baseUrl}/dex/search?q=${encodeURIComponent(query)}`);
                if (!res.ok)
                    throw new Error(`HTTP ${res.status}`);
                return res;
            });
            const data = await response.json();
            const pairs = data.pairs || [];
            return pairs
                .filter(p => p.chainId === 'solana' || p.chainId === 'base')
                .slice(0, 10)
                .map(p => this.transformToTokenData(p, p.chainId));
        }
        catch (error) {
            logger.error('Search failed', error);
            return [];
        }
    }
    /**
     * Get latest token profiles (boosted/promoted)
     */
    async getTokenProfiles() {
        try {
            const response = await this.withRetry(async () => {
                await this.rateLimit();
                // NOTE: token-profiles is NOT under /latest.
                const res = await this.fetchWithTimeout(`https://api.dexscreener.com/token-profiles/latest/v1`);
                if (!res.ok)
                    throw new Error(`HTTP ${res.status}`);
                return res;
            });
            const profiles = await response.json();
            logger.info(`Fetched ${profiles.length} token profiles`);
            return profiles
                .filter((p) => p && p.tokenAddress && p.chainId)
                .map((p) => ({ address: p.tokenAddress, chain: p.chainId }));
        }
        catch (error) {
            logger.error('Failed to fetch token profiles', error);
            return [];
        }
    }
    /**
     * Main scrape method (for scheduled runs)
     */
    async scrape() {
        const [trending, profiles] = await Promise.all([
            this.getTrendingSolana(20),
            this.getTokenProfiles(),
        ]);
        return { trending, profiles };
    }
    // Helper methods
    filterMemecoins(pairs, chain) {
        const excludedSymbols = ['USDC', 'USDT', 'SOL', 'ETH', 'BTC', 'WBTC', 'WETH', 'WSOL'];
        return pairs.filter(p => {
            // Must be on requested chain
            if (p.chainId !== chain)
                return false;
            // Exclude major stablecoins/tokens
            if (excludedSymbols.includes(p.baseToken.symbol.toUpperCase()))
                return false;
            // Minimum liquidity threshold for memecoins ($1K)
            if (p.liquidity.usd < 1000)
                return false;
            // Must have some volume
            if (p.volume.h24 < 100)
                return false;
            return true;
        });
    }
    transformToTrending(pair, rank) {
        return {
            rank,
            token: this.transformToTokenData(pair, pair.chainId),
            trendingScore: this.calculateTrendingScore(pair),
        };
    }
    transformToTokenData(pair, chain) {
        const warnings = [];
        if (pair?.liquidity?.usd == null)
            warnings.push('missing_liquidity');
        if (pair?.volume?.h24 == null)
            warnings.push('missing_volume24h');
        if (pair?.priceChange?.h24 == null)
            warnings.push('missing_priceChange24h');
        if (pair?.priceChange?.h1 == null)
            warnings.push('missing_priceChange1h');
        if (pair?.txns?.h24 == null)
            warnings.push('missing_txns24h');
        return {
            address: pair.baseToken.address,
            symbol: pair.baseToken.symbol,
            name: pair.baseToken.name,
            chain: chain,
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
    async hydratePairLiquidity(chain, pairAddress) {
        try {
            const response = await this.withRetry(async () => {
                await this.rateLimit();
                const res = await this.fetchWithTimeout(`${this.baseUrl}/dex/pairs/${chain}/${pairAddress}`);
                if (!res.ok)
                    throw new Error(`HTTP ${res.status}`);
                return res;
            });
            const data = (await response.json());
            const pair = data.pair;
            const liquidityUsd = pair?.liquidity?.usd;
            if (typeof liquidityUsd !== 'number')
                return null;
            return { liquidityUsd };
        }
        catch (error) {
            logger.warn(`Pair liquidity hydration failed for ${chain}/${pairAddress}`, error);
            return null;
        }
    }
    calculateTrendingScore(pair) {
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
    getMockTrending(limit) {
        // Mock data for testing when API fails
        return Array.from({ length: limit }, (_, i) => ({
            rank: i + 1,
            token: {
                address: `mock${i}`,
                symbol: `MOCK${i}`,
                name: `Mock Token ${i}`,
                chain: 'solana',
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
exports.DexScreenerScraper = DexScreenerScraper;
exports.default = DexScreenerScraper;
//# sourceMappingURL=dexscreener.js.map
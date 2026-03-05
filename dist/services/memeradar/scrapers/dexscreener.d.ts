/**
 * DexScreener Scraper
 * Fetches trending tokens, pair data, and price updates
 * API: https://docs.dexscreener.com/api/reference
 */
import { BaseScraper } from './base-scraper';
import { TokenData, TrendingToken } from '../shared/types';
type TokenProfileLite = {
    address: string;
    chain: string;
};
export declare class DexScreenerScraper extends BaseScraper {
    private baseUrl;
    constructor();
    /**
     * Get trending tokens on Solana
     */
    getTrendingSolana(limit?: number): Promise<TrendingToken[]>;
    /**
     * Get token data by address
     */
    getTokenByAddress(address: string, chain?: string): Promise<TokenData | null>;
    /**
     * Search for tokens by symbol or name
     */
    searchTokens(query: string): Promise<TokenData[]>;
    /**
     * Get latest token profiles (boosted/promoted)
     */
    getTokenProfiles(): Promise<TokenProfileLite[]>;
    /**
     * Main scrape method (for scheduled runs)
     */
    scrape(): Promise<{
        trending: TrendingToken[];
        profiles: TokenProfileLite[];
    }>;
    private filterMemecoins;
    private transformToTrending;
    private transformToTokenData;
    private hydratePairLiquidity;
    private calculateTrendingScore;
    private getMockTrending;
}
export default DexScreenerScraper;
//# sourceMappingURL=dexscreener.d.ts.map
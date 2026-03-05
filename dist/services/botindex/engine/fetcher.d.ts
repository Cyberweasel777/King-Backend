/**
 * BotIndex Price Data Fetcher
 * Fetches OHLCV data from DEX Screener and GeckoTerminal
 */
import type { PriceSeries, PriceDataSource } from '../engine/types';
/**
 * Fetch price series for a token
 * @param token - Token identifier (chain:address or symbol)
 * @param window - Time window (1h, 24h, 7d, 30d)
 * @param source - Preferred data source
 * @returns Price series with OHLCV data
 */
export declare function fetchPriceSeries(token: string, window?: '1h' | '24h' | '7d' | '30d', source?: PriceDataSource['name']): Promise<PriceSeries | null>;
/**
 * Fetch price series for multiple tokens
 * @param tokens - Array of token identifiers
 * @param window - Time window
 * @returns Map of token to price series
 */
export declare function fetchMultiplePriceSeries(tokens: string[], window?: '1h' | '24h' | '7d' | '30d'): Promise<Map<string, PriceSeries>>;
/**
 * Get aggregated price from multiple sources
 * @param token - Token identifier
 * @returns Aggregated price data
 */
export declare function getAggregatedPrice(token: string): Promise<{
    price: number;
    volume24h: number;
    liquidity: number;
    sources: number;
} | null>;
/**
 * Search for tokens by symbol or name
 * @param query - Search query
 * @returns Array of matching tokens
 */
export declare function searchTokens(query: string): Promise<{
    address: string;
    chain: string;
    symbol: string;
    name: string;
}[]>;
/**
 * Clear price cache
 */
export declare function clearPriceCache(): void;
/**
 * Get cache statistics
 */
export declare function getCacheStats(): {
    size: number;
    oldestEntry: number;
    newestEntry: number;
};
//# sourceMappingURL=fetcher.d.ts.map
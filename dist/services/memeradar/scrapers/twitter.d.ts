/**
 * Twitter/X Scraper
 * Monitors social sentiment for memecoins
 * Uses Twitter API v2 for search and streaming
 */
import { BaseScraper } from './base-scraper';
import { SentimentData } from '../shared/types';
export declare class TwitterScraper extends BaseScraper {
    private bearerToken;
    private baseUrl;
    private trackedTokens;
    constructor(bearerToken: string);
    /**
     * Search for token mentions
     */
    searchTokenMentions(tokenSymbol: string, hoursBack?: number): Promise<SentimentData>;
    /**
     * Get trending crypto topics
     */
    getTrendingCryptoTopics(): Promise<string[]>;
    /**
     * Monitor multiple tokens for sentiment changes
     */
    monitorTokens(tokens: string[]): Promise<SentimentData[]>;
    /**
     * Main scrape method for scheduled runs
     */
    scrape(): Promise<{
        sentiments: SentimentData[];
    }>;
    private calculateSentiment;
    private getMockSentiment;
}
export default TwitterScraper;
//# sourceMappingURL=twitter.d.ts.map
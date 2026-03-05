/**
 * Social Sentiment Cache — in-memory + file persistence
 * Follows the same pattern as freeTrial.ts ledger
 */
import type { ConvergenceSignal } from './convergence-scorer';
import type { SentimentResult } from './sentiment-analyzer';
import type { Tweet } from './twitter-scraper';
interface SocialCacheData {
    convergenceSignals: ConvergenceSignal[];
    sentimentResults: SentimentResult[];
    tweetCount: number;
    lastRefresh: string | null;
    refreshDurationMs: number | null;
    accountsScraped: number;
    accountsWithTweets: number;
}
export declare function getCache(): SocialCacheData;
export declare function getCacheAge(): number | null;
export declare function updateCache(update: {
    convergenceSignals: ConvergenceSignal[];
    sentimentResults: SentimentResult[];
    tweets: Tweet[];
    accountsScraped: number;
    accountsWithTweets: number;
    durationMs: number;
}): void;
export {};
//# sourceMappingURL=social-cache.d.ts.map
import type { Tweet } from './twitter-scraper';
type SentimentLabel = 'bullish' | 'bearish' | 'neutral';
export interface SentimentResult {
    handle: string;
    text: string;
    tokens: string[];
    sentiment: SentimentLabel;
    confidence: number;
    timestamp: string;
}
export declare function analyzeSentiment(tweets: Tweet[]): Promise<SentimentResult[]>;
export {};
//# sourceMappingURL=sentiment-analyzer.d.ts.map
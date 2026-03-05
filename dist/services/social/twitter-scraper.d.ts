export interface Tweet {
    handle: string;
    text: string;
    timestamp: string;
    likes: number;
    retweets: number;
    replies: number;
}
export declare function fetchRecentTweets(handles: string[], maxPerAccount?: number): Promise<Tweet[]>;
//# sourceMappingURL=twitter-scraper.d.ts.map
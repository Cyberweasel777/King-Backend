interface BotMetrics {
    botId: string;
    name: string;
    platform: string;
    category: string;
    responseTimeMs: number;
    uptimePercent: number;
    requestCount24h: number;
    errorRate: number;
    userCount: number;
    activeUsers24h: number;
    growthRate7d: number;
    userRating: number;
    reviewCount: number;
    overallScore: number;
    rank: number;
    lastUpdated: Date;
}
interface BotRanking {
    category: string;
    bots: BotMetrics[];
    topPerformer: BotMetrics | null;
    averageScore: number;
}
export declare function runBotIndexPipeline(): Promise<void>;
export declare const runPipeline: typeof runBotIndexPipeline;
export type { BotMetrics, BotRanking };
//# sourceMappingURL=index.d.ts.map
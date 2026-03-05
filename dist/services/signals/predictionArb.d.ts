export interface PredictionArbFeed {
    mode: 'demo' | 'live';
    timestamp: string;
    adapterSummary: Array<{
        venue: string;
        status: string;
        markets: number;
        reason?: string;
    }>;
    venueStats?: Array<{
        venue: string;
        marketCount: number;
        totalLiquidityUsd: number;
        totalVolume24h: number;
        avgPrice: number;
        avgResolutionHours: number | null;
    }>;
    opportunities: Array<{
        eventSlug: string;
        marketTitle: string;
        outcome: string;
        bestBuyVenue: string;
        bestSellVenue: string;
        buyPrice: number;
        sellPrice: number;
        grossEdgePct: number;
        estimatedNetEdgePct: number;
        timestamp: string;
    }>;
}
export declare function getPredictionArbFeed(): {
    feed: PredictionArbFeed | null;
    sourcePath: string | null;
};
export declare function buildHeatMap(feed: PredictionArbFeed): {
    venue: string;
    liquidityUsd: number;
    volume24h: number;
    avgPricePct: number;
    avgResolutionHours: number | null;
    topEdgeNetPct: number;
    heatScore: number;
}[];
//# sourceMappingURL=predictionArb.d.ts.map
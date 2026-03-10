/**
 * Zora Creator Scores — LIVE data from Zora REST API.
 *
 * Fetches the most valuable creator coins and scores them based on
 * market cap, volume, and holder metrics.
 *
 * Source: https://api-sdk.zora.engineering/explore?listType=MOST_VALUABLE_CREATORS
 * Docs: https://docs.zora.co/coins/sdk/queries/explore
 */
export type ZoraCreatorScore = {
    address: string;
    creatorAddress: string;
    handle: string | null;
    coinSymbol: string;
    name: string;
    marketCap: number;
    volume24h: number;
    totalVolume: number;
    uniqueHolders: number;
    marketCapDelta24h: number;
    score: number;
};
export type ZoraCreatorScoresResponse = {
    creators: ZoraCreatorScore[];
    source: 'live' | 'error';
    count: number;
    fetchedAt: string;
};
export declare function getZoraCreatorScores(limit: number): Promise<ZoraCreatorScoresResponse>;
//# sourceMappingURL=creator-scores.d.ts.map
/**
 * Zora Attention Momentum — LIVE data from Zora REST API.
 *
 * Computes "attention momentum" by comparing TOP_GAINERS (market cap delta)
 * with TOP_VOLUME_24H to identify coins where both price action and volume
 * are accelerating. This is derived intelligence, not a direct Zora endpoint.
 *
 * Source: https://api-sdk.zora.engineering/explore
 * Lists used: TOP_GAINERS + LAST_TRADED_UNIQUE
 */
export type AttentionTrend = {
    coinAddress: string;
    name: string;
    symbol: string;
    velocityScore: number;
    volume24h: number;
    marketCapDelta24h: number;
    uniqueHolders: number;
    direction: 'up' | 'down' | 'flat';
    creatorHandle: string | null;
};
export type AttentionMomentumResponse = {
    trends: AttentionTrend[];
    source: 'live' | 'error';
    fetchedAt: string;
};
export declare function getAttentionMomentum(limit: number): Promise<AttentionMomentumResponse>;
//# sourceMappingURL=attention.d.ts.map
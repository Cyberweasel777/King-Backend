/**
 * Zora Trending Coins — LIVE data from Zora REST API.
 *
 * Source: https://api-sdk.zora.engineering/explore?listType=TOP_VOLUME_24H
 * Docs: https://docs.zora.co/coins/sdk/queries/explore
 *
 * Returns top coins by 24h trading volume with market cap, holder count,
 * and price changes.
 */
export type ZoraTrendingCoin = {
    address: string;
    name: string;
    symbol: string;
    creatorAddress: string;
    creatorHandle: string | null;
    volume24h: number;
    totalVolume: number;
    marketCap: number;
    marketCapDelta24h: number;
    uniqueHolders: number;
    createdAt: string;
    chainId: number;
    coinType: string;
};
export type ZoraTrendingSource = 'live' | 'error';
export type ZoraTrendingCoinsResponse = {
    coins: ZoraTrendingCoin[];
    source: ZoraTrendingSource;
    count: number;
    fetchedAt: string;
};
export declare function getZoraTrendingCoins(limit: number): Promise<ZoraTrendingCoinsResponse>;
//# sourceMappingURL=trending.d.ts.map
export type ZoraTrendingCoin = {
    address: string;
    name: string;
    symbol: string;
    volume24h: number;
    priceChange1h: number;
    priceChange24h: number;
    holders: number;
    tradingFees24h: number;
};
export type ZoraTrendingSource = 'live' | 'mock';
export type ZoraTrendingCoinsResponse = {
    coins: ZoraTrendingCoin[];
    source: ZoraTrendingSource;
    provider: 'zora_graphql' | 'zora_rest' | 'mock_seed';
};
export declare function getZoraTrendingCoins(limit: number): Promise<ZoraTrendingCoinsResponse>;
//# sourceMappingURL=trending.d.ts.map
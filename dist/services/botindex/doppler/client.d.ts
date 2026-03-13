type DataSource = 'indexer' | 'rpc';
export interface DopplerAsset {
    address: string;
    chainId: number;
    name: string | null;
    symbol: string | null;
    decimals: number | null;
    marketCapUsd: number;
    dayVolumeUsd: number;
    liquidityUsd: number;
    createdAt: string;
    ageHours: number;
    volumeVelocity: number;
    holderCount: number;
    integrator: string | null;
    creatorAddress: string | null;
    creatorLaunchCount: number;
    numTokensToSell: number | null;
    migrated: boolean;
    percentDayChange: number | null;
    image: string | null;
    isDerc20: boolean | null;
    sniperProtectionEnabled: boolean;
    source: DataSource;
    status?: string;
}
export declare class DopplerClient {
    private readonly indexerClient;
    private readonly viem;
    private readonly publicClient;
    private readonly erc20Abi;
    private readonly transferEvent;
    private readonly cache;
    private readonly knownAssets;
    private readonly cacheTtlMs;
    constructor();
    getRecentLaunches(hours: number, limit: number): Promise<DopplerAsset[]>;
    getAssetDetails(address: string): Promise<DopplerAsset>;
    getTrendingAssets(limit: number): Promise<DopplerAsset[]>;
    private getFromCache;
    private setCache;
    private rememberAssets;
    private mapAssetRow;
    private applyIntegratorCounts;
    private fetchIndexerAssets;
    private fetchIndexerAssetDetails;
    private getFallbackAddresses;
    private getRecentLaunchesFromRpc;
    private buildNoLaunchesMessage;
    private getTrendingFromRpc;
    private inferCreatedAtFromLogs;
    private fetchAssetFromRpc;
}
export declare const dopplerClient: DopplerClient;
export {};
//# sourceMappingURL=client.d.ts.map
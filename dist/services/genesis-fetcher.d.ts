type LaunchType = 'pool' | 'presale' | 'auction' | 'unknown';
type LaunchStatus = 'upcoming' | 'active' | 'completed';
export interface GenesisBucketSummary {
    bucketState: string;
    tokenMint: string;
    metadataUrl: string | null;
    maxTokenCapacity: string;
    launchState: string;
    currentSol: string;
    currentTokenAllocation: string;
    claimedAmount: string;
    maxCapacity: string;
    limitPerUser: string;
    creatorFees: Array<{
        address: string;
        percentage: number;
    }>;
}
export interface GenesisLaunch {
    mint: string;
    name: string;
    launchType: LaunchType;
    depositStart: string | null;
    depositEnd: string | null;
    claimStart: string | null;
    claimEnd: string | null;
    totalDeposits: string;
    tokenAllocation: string;
    status: LaunchStatus;
    genesisAccount: string;
    buckets: GenesisBucketSummary[];
}
export interface GenesisFetchResponse {
    launches: GenesisLaunch[];
    updatedAt: string;
    stale: boolean;
    error?: string;
}
export declare function getAllLaunches(): Promise<GenesisFetchResponse>;
export declare function getActiveLaunches(): Promise<GenesisFetchResponse>;
export {};
//# sourceMappingURL=genesis-fetcher.d.ts.map
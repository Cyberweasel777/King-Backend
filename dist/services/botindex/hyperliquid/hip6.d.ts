export type Hip6LaunchCandidate = {
    symbol: string;
    markPrice: number;
    fundingRate: number;
    dayNotionalVolume: number;
    openInterest: number;
    launchReadinessScore: number;
    rationale: string[];
};
export type Hip6LaunchCandidatesResponse = {
    source: 'hyperliquid_metaAndAssetCtxs';
    generatedAt: string;
    methodology: string;
    candidates: Hip6LaunchCandidate[];
};
export declare function getHip6LaunchCandidates(limit?: number): Promise<Hip6LaunchCandidatesResponse>;
//# sourceMappingURL=hip6.d.ts.map
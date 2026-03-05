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
export type Hip6Snapshot = {
    generatedAt: string;
    topCandidates: Hip6LaunchCandidate[];
    breadth: {
        trackedSymbols: number;
        strongSignals: number;
        avgLaunchReadiness: number;
    };
};
export type Hip6FeedHistoryResponse = {
    source: 'in_memory_history';
    generatedAt: string;
    history: Hip6Snapshot[];
    note: string;
};
export type Hip6AlertScore = {
    symbol: string;
    currentReadiness: number;
    previousReadiness: number;
    scoreDelta: number;
    volumeDeltaPct: number;
    fundingDeltaBps: number;
    alertScore: number;
    severity: 'info' | 'watch' | 'alert';
};
export type Hip6AlertScoresResponse = {
    source: 'derived_from_recent_history';
    generatedAt: string;
    lookbackSnapshots: number;
    alerts: Hip6AlertScore[];
};
export declare function getHip6LaunchCandidates(limit?: number): Promise<Hip6LaunchCandidatesResponse>;
export declare function getHip6FeedHistory(limit?: number): Hip6FeedHistoryResponse;
export declare function getHip6AlertScores(limit?: number): Hip6AlertScoresResponse;
//# sourceMappingURL=hip6.d.ts.map
export type ZoraCreatorScore = {
    address: string;
    username: string;
    coinSymbol: string;
    totalVolume: number;
    holderCount: number;
    feeEarnings: number;
    score: number;
};
export type ZoraCreatorScoresResponse = {
    creators: ZoraCreatorScore[];
};
export declare function getZoraCreatorScores(limit: number): Promise<ZoraCreatorScoresResponse>;
//# sourceMappingURL=creator-scores.d.ts.map
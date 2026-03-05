/**
 * Roster/Correlation Provider — Structured JSON data for BotIndex API
 * Replaces RosterRadar's hardcoded Telegram responses
 */
export interface PlayerCorrelation {
    playerA: string;
    playerB: string;
    teamA: string;
    teamB: string;
    sport: string;
    correlation: number;
    window: string;
    sampleSize: number;
    direction: 'positive' | 'negative';
}
export interface LineupProjection {
    player: string;
    team: string;
    sport: string;
    position: string;
    projectedValue: number;
    salary: number;
    expectedValue: number;
    riskTier: 'low' | 'medium' | 'high';
    correlationScore: number;
}
export declare function getCorrelations(): Promise<{
    correlations: PlayerCorrelation[];
    updatedAt: string;
}>;
export declare function getLineupOptimizer(): Promise<{
    lineup: LineupProjection[];
    totalEV: number;
    totalSalary: number;
    riskTier: string;
    correlationAdjustedScore: number;
    updatedAt: string;
}>;
//# sourceMappingURL=rosterProvider.d.ts.map
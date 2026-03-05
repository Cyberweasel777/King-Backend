/** ArbWatch DeepSeek Stats - Types */
/** Implied probability calculation from odds */
export interface ImpliedProbabilityInput {
    odds: number;
    oddsType: 'decimal' | 'american' | 'fractional';
    market?: string;
    timestamp?: number;
}
export interface ImpliedProbabilityResult {
    impliedProbability: number;
    overround: number;
    trueProbability?: number;
    confidence: number;
}
/** Kelly criterion position sizing */
export interface KellyCriterionInput {
    bankroll: number;
    winProbability: number;
    odds: number;
    kellyFraction?: number;
}
export interface KellyCriterionResult {
    optimalStake: number;
    stakePercentage: number;
    edge: number;
    expectedGrowth: number;
    halfKellyStake?: number;
}
/** Expected value calculation for arbitrage */
export interface ArbitrageEVInput {
    stake: number;
    oddsA: number;
    oddsB: number;
    probabilityA?: number;
}
export interface ArbitrageEVResult {
    expectedValue: number;
    evPercentage: number;
    roi: number;
    variance: number;
    sharpeRatio: number;
}
/** Arbitrage opportunity analysis */
export interface ArbitrageOpportunityInput {
    market: string;
    oddsA: number;
    oddsB: number;
    bookmakerA: string;
    bookmakerB: string;
    availableLiquidityA?: number;
    availableLiquidityB?: number;
}
export interface ArbitrageOpportunityResult {
    isArbitrage: boolean;
    profitPercentage: number;
    optimalStakeA: number;
    optimalStakeB: number;
    totalInvestment: number;
    guaranteedReturn: number;
    riskFactors: string[];
    arbQuality: 'poor' | 'fair' | 'good' | 'excellent';
}
/** Historical arb decay analysis */
export interface ArbDecayInput {
    historicalProfits: number[];
    timestamps: number[];
    marketCategory: string;
}
export interface ArbDecayResult {
    halfLife: number;
    decayRate: number;
    trend: 'improving' | 'stable' | 'decaying';
    seasonalityDetected: boolean;
    predictedProfit24h: number;
}
/** Main analysis request types */
export type AnalysisType = 'impliedProbability' | 'kellyCriterion' | 'arbitrageEV' | 'arbitrageOpportunity' | 'arbDecay';
export interface StatsRequest<T> {
    type: AnalysisType;
    data: T;
    useCache?: boolean;
    deepAnalysis?: boolean;
}
export interface StatsResponse<T> {
    success: boolean;
    result?: T;
    error?: string;
    fromCache?: boolean;
    processingTimeMs?: number;
    modelUsed?: string;
}
/** Validation utilities */
export declare const VALIDATION_RANGES: {
    readonly probability: {
        readonly min: 0;
        readonly max: 1;
    };
    readonly odds: {
        readonly min: 1.001;
        readonly max: 1000;
    };
    readonly percentage: {
        readonly min: -1000;
        readonly max: 1000;
    };
    readonly stake: {
        readonly min: 0;
        readonly max: 1000000000;
    };
};
export declare function clamp(value: number, min: number, max: number): number;
export declare function clampProbability(p: number): number;
export declare function clampOdds(o: number): number;
//# sourceMappingURL=types.d.ts.map
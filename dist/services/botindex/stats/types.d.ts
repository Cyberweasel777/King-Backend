/** BotIndex DeepSeek Stats - Types */
/** Correlation calculation inputs */
export interface CorrelationInput {
    seriesA: number[];
    seriesB: number[];
    method: 'pearson' | 'spearman' | 'kendall';
    timestamps?: number[];
}
export interface CorrelationResult {
    correlation: number;
    pValue: number;
    confidenceInterval: [number, number];
    sampleSize: number;
    strength: 'none' | 'weak' | 'moderate' | 'strong';
    direction: 'positive' | 'negative' | 'none';
}
/** PCA clustering for multi-asset analysis */
export interface PCAInput {
    data: number[][];
    assetNames: string[];
    nComponents?: number;
}
export interface PCAResult {
    components: number[][];
    explainedVariance: number[];
    loadings: number[][];
    clusterAssignments: Record<string, number>;
    outliers: string[];
}
/** Market regime detection */
export interface RegimeInput {
    prices: number[];
    volumes?: number[];
    timestamps: number[];
    lookbackDays?: number;
}
export interface RegimeResult {
    currentRegime: 'trending_up' | 'trending_down' | 'ranging' | 'volatile' | 'unknown';
    regimeHistory: Array<{
        start: number;
        end: number;
        regime: string;
    }>;
    regimeProbabilities: Record<string, number>;
    transitionMatrix: number[][];
    expectedDuration: number;
}
/** Granger causality testing */
export interface GrangerInput {
    causeSeries: number[];
    effectSeries: number[];
    maxLag?: number;
    significance?: number;
}
export interface GrangerResult {
    isCausal: boolean;
    fStatistic: number;
    pValue: number;
    optimalLag: number;
    causalityStrength: 'none' | 'weak' | 'moderate' | 'strong';
    direction: string;
}
/** Volatility modeling */
export interface VolatilityInput {
    returns: number[];
    timestamps?: number[];
    forecastHorizon?: number;
    model?: 'garch' | 'ewma' | 'simple';
}
export interface VolatilityResult {
    currentVolatility: number;
    forecast: number[];
    volatilityRegime: 'low' | 'normal' | 'high' | 'extreme';
    valueAtRisk: {
        '95%': number;
        '99%': number;
    };
    maxDrawdownEstimate: number;
}
/** Multi-asset correlation matrix */
export interface CorrelationMatrixInput {
    series: Record<string, number[]>;
    method?: 'pearson' | 'spearman';
}
export interface CorrelationMatrixResult {
    matrix: Record<string, Record<string, number>>;
    eigenvalues: number[];
    conditionNumber: number;
    highlyCorrelatedPairs: Array<[string, string, number]>;
    diversificationScore: number;
}
/** Main analysis types */
export type AnalysisType = 'correlation' | 'pca' | 'regime' | 'granger' | 'volatility' | 'correlationMatrix';
/** Stats request wrapper */
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
    readonly correlation: {
        readonly min: -1;
        readonly max: 1;
    };
    readonly probability: {
        readonly min: 0;
        readonly max: 1;
    };
    readonly percentage: {
        readonly min: -1000;
        readonly max: 1000;
    };
    readonly variance: {
        readonly min: 0;
        readonly max: 1000000000000;
    };
};
export declare function clamp(value: number, min: number, max: number): number;
export declare function clampCorrelation(r: number): number;
export declare function clampProbability(p: number): number;
//# sourceMappingURL=types.d.ts.map
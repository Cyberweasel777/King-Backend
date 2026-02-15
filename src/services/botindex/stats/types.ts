/** BotIndex DeepSeek Stats - Types */

/** Correlation calculation inputs */
export interface CorrelationInput {
  seriesA: number[];
  seriesB: number[];
  method: 'pearson' | 'spearman' | 'kendall';
  timestamps?: number[];  // For time-aligned data
}

export interface CorrelationResult {
  correlation: number;        // -1 to 1
  pValue: number;            // Significance 0-1
  confidenceInterval: [number, number]; // 95% CI
  sampleSize: number;
  strength: 'none' | 'weak' | 'moderate' | 'strong';
  direction: 'positive' | 'negative' | 'none';
}

/** PCA clustering for multi-asset analysis */
export interface PCAInput {
  data: number[][];          // Matrix: assets x timepoints
  assetNames: string[];
  nComponents?: number;      // Default 3
}

export interface PCAResult {
  components: number[][];    // Principal components
  explainedVariance: number[]; // % variance per component
  loadings: number[][];      // Asset loadings on components
  clusterAssignments: Record<string, number>;
  outliers: string[];        // Assets that don't fit clusters
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
  expectedDuration: number;  // Expected days in current regime
}

/** Granger causality testing */
export interface GrangerInput {
  causeSeries: number[];
  effectSeries: number[];
  maxLag?: number;           // Max lag to test
  significance?: number;     // Default 0.05
}

export interface GrangerResult {
  isCausal: boolean;         // Null hypothesis rejected
  fStatistic: number;
  pValue: number;
  optimalLag: number;
  causalityStrength: 'none' | 'weak' | 'moderate' | 'strong';
  direction: string;         // "X causes Y" description
}

/** Volatility modeling */
export interface VolatilityInput {
  returns: number[];         // Log returns
  timestamps?: number[];
  forecastHorizon?: number;  // Days ahead
  model?: 'garch' | 'ewma' | 'simple';
}

export interface VolatilityResult {
  currentVolatility: number; // Annualized
  forecast: number[];        // Predicted vol for horizon
  volatilityRegime: 'low' | 'normal' | 'high' | 'extreme';
  valueAtRisk: {             // VaR estimates
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
  diversificationScore: number; // 0-1, higher is better
}

/** Main analysis types */
export type AnalysisType =
  | 'correlation'
  | 'pca'
  | 'regime'
  | 'granger'
  | 'volatility'
  | 'correlationMatrix';

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
export const VALIDATION_RANGES = {
  correlation: { min: -1, max: 1 },
  probability: { min: 0, max: 1 },
  percentage: { min: -1000, max: 1000 },
  variance: { min: 0, max: 1e12 },
} as const;

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function clampCorrelation(r: number): number {
  return clamp(r, VALIDATION_RANGES.correlation.min, VALIDATION_RANGES.correlation.max);
}

export function clampProbability(p: number): number {
  return clamp(p, VALIDATION_RANGES.probability.min, VALIDATION_RANGES.probability.max);
}

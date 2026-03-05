/**
 * BotIndex Correlation Engine
 * Core calculation logic for token-to-token correlation analysis
 */
import type { PriceSeries, CorrelationResult, LeadLagResult } from './types';
/**
 * Calculate Pearson correlation coefficient between two price series
 * @param seriesA - First price series
 * @param seriesB - Second price series
 * @returns Correlation coefficient (-1 to 1)
 */
export declare function pearsonCorrelation(seriesA: number[], seriesB: number[]): {
    coefficient: number;
    significance: number;
};
/**
 * Calculate rolling window correlation
 * @param pricesA - First price series
 * @param pricesB - Second price series
 * @param window - Window size
 * @returns Array of correlation results for each window
 */
export declare function rollingCorrelation(pricesA: number[], pricesB: number[], window: number): {
    timestamp: number;
    correlation: number;
    significance: number;
}[];
/**
 * Calculate cross-correlation for lead/lag analysis
 * @param seriesA - Leading candidate series
 * @param seriesB - Following candidate series
 * @param maxLag - Maximum lag to check (in periods)
 * @returns Lead/lag analysis results
 */
export declare function crossCorrelation(seriesA: number[], seriesB: number[], maxLag?: number): LeadLagResult;
/**
 * Calculate returns from price series
 * @param prices - Array of prices
 * @returns Array of returns (percentage changes)
 */
export declare function calculateReturns(prices: number[]): number[];
/**
 * Calculate correlation between two tokens
 * @param seriesA - OHLCV data for token A
 * @param seriesB - OHLCV data for token B
 * @param options - Calculation options
 * @returns Full correlation result
 */
export declare function calculateCorrelation(seriesA: PriceSeries, seriesB: PriceSeries, options?: {
    useReturns?: boolean;
    window?: number;
    timeShiftHours?: number;
}): CorrelationResult;
/**
 * Detect correlation anomalies (breaking correlations)
 * @param current - Current correlation value
 * @param history - Historical correlation values
 * @param threshold - Standard deviations for anomaly detection
 * @returns Anomaly detection result
 */
export declare function detectAnomaly(current: number, history: number[], threshold?: number): {
    isAnomaly: boolean;
    severity: 'none' | 'low' | 'medium' | 'high';
    direction: 'increasing' | 'decreasing' | 'stable';
    zScore: number;
};
/**
 * Calculate statistical significance using t-test
 * @param correlation - Correlation coefficient
 * @param n - Sample size
 * @returns P-value (0-1, lower = more significant)
 */
export declare function calculatePValue(correlation: number, n: number): number;
/**
 * Calculate beta (systematic risk) of token relative to market
 * @param tokenReturns - Token return series
 * @param marketReturns - Market return series
 * @returns Beta value
 */
export declare function calculateBeta(tokenReturns: number[], marketReturns: number[]): number;
/**
 * Batch calculate correlations for multiple pairs
 * @param priceSeries - Array of price series
 * @returns Map of correlation results
 */
export declare function batchCalculateCorrelations(priceSeries: PriceSeries[], options?: {
    minSampleSize?: number;
    useReturns?: boolean;
}): Map<string, CorrelationResult>;
//# sourceMappingURL=correlation.d.ts.map
/**
 * BotIndex Correlation Engine
 * Core calculation logic for token-to-token correlation analysis
 */

import type { OHLCVPoint, PriceSeries, CorrelationResult, LeadLagResult } from './types';

/**
 * Calculate Pearson correlation coefficient between two price series
 * @param seriesA - First price series
 * @param seriesB - Second price series
 * @returns Correlation coefficient (-1 to 1)
 */
export function pearsonCorrelation(
  seriesA: number[],
  seriesB: number[]
): { coefficient: number; significance: number } {
  if (seriesA.length !== seriesB.length) {
    throw new Error('Series must have equal length');
  }

  const n = seriesA.length;
  if (n < 2) {
    return { coefficient: 0, significance: 0 };
  }

  const sumA = seriesA.reduce((a, b) => a + b, 0);
  const sumB = seriesB.reduce((a, b) => a + b, 0);
  const sumASq = seriesA.reduce((a, b) => a + b * b, 0);
  const sumBSq = seriesB.reduce((a, b) => a + b * b, 0);
  const sumAB = seriesA.reduce((sum, a, i) => sum + a * seriesB[i], 0);

  const numerator = n * sumAB - sumA * sumB;
  const denominator = Math.sqrt((n * sumASq - sumA * sumA) * (n * sumBSq - sumB * sumB));

  if (denominator === 0) {
    return { coefficient: 0, significance: 0 };
  }

  const coefficient = numerator / denominator;
  
  // Calculate significance (t-statistic for correlation)
  // t = r * sqrt((n-2)/(1-r²))
  const rSquared = coefficient * coefficient;
  const tStatistic = coefficient * Math.sqrt((n - 2) / (1 - rSquared));
  
  // Approximate p-value (simplified)
  // For large n, t approximates normal distribution
  const significance = Math.min(1, Math.abs(tStatistic) / 2.576); // 99% confidence ~ 2.576

  return { 
    coefficient: Math.max(-1, Math.min(1, coefficient)),
    significance: Math.max(0, Math.min(1, significance))
  };
}

/**
 * Calculate rolling window correlation
 * @param pricesA - First price series
 * @param pricesB - Second price series
 * @param window - Window size
 * @returns Array of correlation results for each window
 */
export function rollingCorrelation(
  pricesA: number[],
  pricesB: number[],
  window: number
): { timestamp: number; correlation: number; significance: number }[] {
  if (pricesA.length !== pricesB.length) {
    throw new Error('Price series must have equal length');
  }

  const results: { timestamp: number; correlation: number; significance: number }[] = [];

  for (let i = window - 1; i < pricesA.length; i++) {
    const windowA = pricesA.slice(i - window + 1, i + 1);
    const windowB = pricesB.slice(i - window + 1, i + 1);
    
    const { coefficient, significance } = pearsonCorrelation(windowA, windowB);
    
    results.push({
      timestamp: i,
      correlation: coefficient,
      significance
    });
  }

  return results;
}

/**
 * Calculate cross-correlation for lead/lag analysis
 * @param seriesA - Leading candidate series
 * @param seriesB - Following candidate series
 * @param maxLag - Maximum lag to check (in periods)
 * @returns Lead/lag analysis results
 */
export function crossCorrelation(
  seriesA: number[],
  seriesB: number[],
  maxLag: number = 6
): LeadLagResult {
  if (seriesA.length !== seriesB.length) {
    throw new Error('Series must have equal length');
  }

  const n = seriesA.length;
  const correlations: { lag: number; correlation: number; significance: number }[] = [];
  
  let maxCorrelation = -Infinity;
  let optimalLag = 0;
  let isASecond = false;

  // Check lags: negative = A leads B, positive = B leads A
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let shiftedA: number[];
    let shiftedB: number[];

    if (lag < 0) {
      // A leads B (negative lag means A is ahead)
      shiftedA = seriesA.slice(-lag);
      shiftedB = seriesB.slice(0, n + lag);
    } else if (lag > 0) {
      // B leads A (positive lag means B is ahead)
      shiftedA = seriesA.slice(0, n - lag);
      shiftedB = seriesB.slice(lag);
    } else {
      // No lag
      shiftedA = seriesA;
      shiftedB = seriesB;
    }

    const { coefficient, significance } = pearsonCorrelation(shiftedA, shiftedB);
    
    correlations.push({ lag, correlation: coefficient, significance });

    // Track maximum absolute correlation
    if (Math.abs(coefficient) > maxCorrelation) {
      maxCorrelation = Math.abs(coefficient);
      optimalLag = lag;
      isASecond = lag > 0; // If lag > 0, B is leading (A is second)
    }
  }

  // Determine causality strength
  const causalityStrength = maxCorrelation > 0.7 ? 'strong' :
                           maxCorrelation > 0.4 ? 'moderate' : 'weak';

  // Calculate average lead time if there's consistent leading
  const leadingCorrelations = correlations.filter(c => 
    isASecond ? c.lag > 0 : c.lag < 0
  );
  
  const avgLeadTime = leadingCorrelations.length > 0
    ? leadingCorrelations.reduce((sum, c) => sum + Math.abs(c.lag), 0) / leadingCorrelations.length
    : 0;

  return {
    tokenA: 'tokenA',
    tokenB: 'tokenB',
    optimalLag,
    maxCorrelation,
    isASecond,
    causalityStrength,
    avgLeadTime,
    correlations,
    confidence: maxCorrelation > 0.7 ? 'high' : maxCorrelation > 0.4 ? 'medium' : 'low'
  };
}

/**
 * Calculate returns from price series
 * @param prices - Array of prices
 * @returns Array of returns (percentage changes)
 */
export function calculateReturns(prices: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const ret = (prices[i] - prices[i - 1]) / prices[i - 1];
    returns.push(ret);
  }
  return returns;
}

/**
 * Calculate correlation between two tokens
 * @param seriesA - OHLCV data for token A
 * @param seriesB - OHLCV data for token B
 * @param options - Calculation options
 * @returns Full correlation result
 */
export function calculateCorrelation(
  seriesA: PriceSeries,
  seriesB: PriceSeries,
  options: {
    useReturns?: boolean;
    window?: number;
    timeShiftHours?: number;
  } = {}
): CorrelationResult {
  const { useReturns = true, window = 24, timeShiftHours = 0 } = options;

  // Align series by timestamp
  const { alignedA, alignedB, timestamps } = alignSeries(seriesA, seriesB);

  // Extract price data (use close prices)
  let pricesA = alignedA.map(p => p.close);
  let pricesB = alignedB.map(p => p.close);

  // Apply time shift if specified
  if (timeShiftHours !== 0) {
    const shiftPoints = Math.abs(timeShiftHours);
    if (timeShiftHours > 0) {
      // Shift A forward (B leads)
      pricesA = pricesA.slice(shiftPoints);
      pricesB = pricesB.slice(0, -shiftPoints);
    } else {
      // Shift B forward (A leads)
      pricesA = pricesA.slice(0, -shiftPoints);
      pricesB = pricesB.slice(shiftPoints);
    }
  }

  // Convert to returns if requested
  const dataA = useReturns ? calculateReturns(pricesA) : pricesA;
  const dataB = useReturns ? calculateReturns(pricesB) : pricesB;

  // Calculate overall correlation
  const { coefficient, significance } = pearsonCorrelation(dataA, dataB);

  // Calculate rolling correlations
  const rollingWindow = Math.min(window, Math.floor(dataA.length / 2));
  const rolling = rollingCorrelation(dataA, dataB, rollingWindow);

  // Calculate lead/lag relationship
  const leadLag = crossCorrelation(dataA, dataB, 6);

  // Determine relationship type
  let relationship: 'strong_positive' | 'moderate_positive' | 'weak' | 
                   'moderate_negative' | 'strong_negative' | 'leading' | 'following';
  
  const absCorr = Math.abs(coefficient);
  
  if (leadLag.optimalLag !== 0 && absCorr > 0.5) {
    relationship = leadLag.isASecond ? 'following' : 'leading';
  } else if (coefficient > 0.7) {
    relationship = 'strong_positive';
  } else if (coefficient > 0.4) {
    relationship = 'moderate_positive';
  } else if (coefficient < -0.7) {
    relationship = 'strong_negative';
  } else if (coefficient < -0.4) {
    relationship = 'moderate_negative';
  } else {
    relationship = 'weak';
  }

  return {
    tokenA: seriesA.token,
    tokenB: seriesB.token,
    coefficient,
    significance,
    sampleSize: dataA.length,
    relationship,
    rolling,
    leadLag,
    calculatedAt: Date.now()
  };
}

/**
 * Align two price series by timestamp
 * @param seriesA - First price series
 * @param seriesB - Second price series
 * @returns Aligned series with common timestamps
 */
function alignSeries(
  seriesA: PriceSeries,
  seriesB: PriceSeries
): { alignedA: OHLCVPoint[]; alignedB: OHLCVPoint[]; timestamps: number[] } {
  // Create maps for O(1) lookup
  const mapA = new Map(seriesA.data.map(p => [p.timestamp, p]));
  const mapB = new Map(seriesB.data.map(p => [p.timestamp, p]));

  // Find common timestamps
  const commonTimestamps = [...mapA.keys()]
    .filter(ts => mapB.has(ts))
    .sort((a, b) => a - b);

  const alignedA: OHLCVPoint[] = [];
  const alignedB: OHLCVPoint[] = [];

  for (const ts of commonTimestamps) {
    const pointA = mapA.get(ts);
    const pointB = mapB.get(ts);
    if (pointA && pointB) {
      alignedA.push(pointA);
      alignedB.push(pointB);
    }
  }

  return { alignedA, alignedB, timestamps: commonTimestamps }; // eslint-disable-line @typescript-eslint/no-unused-vars
}

/**
 * Detect correlation anomalies (breaking correlations)
 * @param current - Current correlation value
 * @param history - Historical correlation values
 * @param threshold - Standard deviations for anomaly detection
 * @returns Anomaly detection result
 */
export function detectAnomaly(
  current: number,
  history: number[],
  threshold: number = 2
): {
  isAnomaly: boolean;
  severity: 'none' | 'low' | 'medium' | 'high';
  direction: 'increasing' | 'decreasing' | 'stable';
  zScore: number;
} {
  if (history.length < 10) {
    return { isAnomaly: false, severity: 'none', direction: 'stable', zScore: 0 };
  }

  const mean = history.reduce((a, b) => a + b, 0) / history.length;
  const variance = history.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / history.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) {
    return { isAnomaly: false, severity: 'none', direction: 'stable', zScore: 0 };
  }

  const zScore = (current - mean) / stdDev;
  const isAnomaly = Math.abs(zScore) > threshold;

  let severity: 'none' | 'low' | 'medium' | 'high' = 'none';
  if (isAnomaly) {
    severity = Math.abs(zScore) > 3 ? 'high' : Math.abs(zScore) > 2.5 ? 'medium' : 'low';
  }

  const direction = zScore > 0.5 ? 'increasing' : zScore < -0.5 ? 'decreasing' : 'stable';

  return { isAnomaly, severity, direction, zScore };
}

/**
 * Calculate statistical significance using t-test
 * @param correlation - Correlation coefficient
 * @param n - Sample size
 * @returns P-value (0-1, lower = more significant)
 */
export function calculatePValue(correlation: number, n: number): number {
  if (n < 3) return 1;
  
  const t = correlation * Math.sqrt((n - 2) / (1 - correlation * correlation));
  
  // Approximate p-value using normal distribution
  // This is a simplified approximation
  const pValue = 2 * (1 - normalCDF(Math.abs(t)));
  
  return Math.max(0, Math.min(1, pValue));
}

/**
 * Standard normal cumulative distribution function
 * @param x - Input value
 * @returns CDF value
 */
function normalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  
  return x > 0 ? 1 - prob : prob;
}

/**
 * Calculate beta (systematic risk) of token relative to market
 * @param tokenReturns - Token return series
 * @param marketReturns - Market return series
 * @returns Beta value
 */
export function calculateBeta(
  tokenReturns: number[],
  marketReturns: number[]
): number {
  if (tokenReturns.length !== marketReturns.length || tokenReturns.length === 0) {
    return 0;
  }

  const { coefficient } = pearsonCorrelation(tokenReturns, marketReturns);
  
  const tokenStd = Math.sqrt(
    tokenReturns.reduce((sum, r) => sum + r * r, 0) / tokenReturns.length -
    Math.pow(tokenReturns.reduce((a, b) => a + b, 0) / tokenReturns.length, 2)
  );
  
  const marketStd = Math.sqrt(
    marketReturns.reduce((sum, r) => sum + r * r, 0) / marketReturns.length -
    Math.pow(marketReturns.reduce((a, b) => a + b, 0) / marketReturns.length, 2)
  );

  if (marketStd === 0) return 0;

  return coefficient * (tokenStd / marketStd);
}

/**
 * Batch calculate correlations for multiple pairs
 * @param priceSeries - Array of price series
 * @returns Map of correlation results
 */
export function batchCalculateCorrelations(
  priceSeries: PriceSeries[],
  options: {
    minSampleSize?: number;
    useReturns?: boolean;
  } = {}
): Map<string, CorrelationResult> {
  const { minSampleSize = 10, useReturns = true } = options;
  const results = new Map<string, CorrelationResult>();

  for (let i = 0; i < priceSeries.length; i++) {
    for (let j = i + 1; j < priceSeries.length; j++) {
      const seriesA = priceSeries[i];
      const seriesB = priceSeries[j];

      // Skip if insufficient data
      if (seriesA.data.length < minSampleSize || seriesB.data.length < minSampleSize) {
        continue;
      }

      const result = calculateCorrelation(seriesA, seriesB, { useReturns });
      
      // Store with sorted key for consistency
      const key = [seriesA.token, seriesB.token].sort().join('-');
      results.set(key, result);
    }
  }

  return results;
}

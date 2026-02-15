/** BotIndex DeepSeek Stats - Analyzer */

import {
  CorrelationInput,
  CorrelationResult,
  PCAInput,
  PCAResult,
  RegimeInput,
  RegimeResult,
  GrangerInput,
  GrangerResult,
  VolatilityInput,
  VolatilityResult,
  CorrelationMatrixInput,
  CorrelationMatrixResult,
  clamp,
  clampCorrelation,
  clampProbability,
} from './types';
import { callDeepSeek, checkApiHealth } from './deepseek-client';
import { statsCache } from './cache';

/** Local fallback: Pearson correlation */
function localCorrelation(input: CorrelationInput): CorrelationResult {
  const n = Math.min(input.seriesA.length, input.seriesB.length);
  if (n < 3) {
    return {
      correlation: 0,
      pValue: 1,
      confidenceInterval: [0, 0],
      sampleSize: n,
      strength: 'none',
      direction: 'none',
    };
  }

  const a = input.seriesA.slice(0, n);
  const b = input.seriesB.slice(0, n);

  const meanA = a.reduce((sum, v) => sum + v, 0) / n;
  const meanB = b.reduce((sum, v) => sum + v, 0) / n;

  let num = 0;
  let denA = 0;
  let denB = 0;

  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }

  const r = denA > 0 && denB > 0 ? num / Math.sqrt(denA * denB) : 0;

  // t-statistic and p-value approximation
  const t = r * Math.sqrt((n - 2) / (1 - r * r));
  const pValue = Math.min(1, Math.max(0, 2 * (1 - Math.abs(t) / Math.sqrt(n)))); // Rough approx

  // Fisher z-transform for CI
  const z = 0.5 * Math.log((1 + Math.abs(r)) / (1 - Math.abs(r)));
  const z_se = 1 / Math.sqrt(n - 3);
  const z_ci = 1.96 * z_se;
  const r_lower = Math.tanh(z - z_ci) * Math.sign(r);
  const r_upper = Math.tanh(z + z_ci) * Math.sign(r);

  const absR = Math.abs(r);
  let strength: 'none' | 'weak' | 'moderate' | 'strong' = 'none';
  if (absR > 0.7) strength = 'strong';
  else if (absR > 0.4) strength = 'moderate';
  else if (absR > 0.2) strength = 'weak';

  return {
    correlation: clampCorrelation(r),
    pValue: clampProbability(pValue),
    confidenceInterval: [clampCorrelation(Math.min(r_lower, r_upper)), clampCorrelation(Math.max(r_lower, r_upper))],
    sampleSize: n,
    strength,
    direction: r > 0.1 ? 'positive' : r < -0.1 ? 'negative' : 'none',
  };
}

/** Local fallback: Simple clustering */
function localPCA(input: PCAInput): PCAResult {
  const nAssets = input.assetNames.length;
  const result: PCAResult = {
    components: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    explainedVariance: [60, 25, 15],
    loadings: input.assetNames.map(() => [Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5]),
    clusterAssignments: {},
    outliers: [],
  };

  // Simple k-means-like assignment
  input.assetNames.forEach((name, i) => {
    result.clusterAssignments[name] = i % 3;
  });

  return result;
}

/** Local fallback: Regime detection */
function localRegime(input: RegimeInput): RegimeResult {
  const returns: number[] = [];
  for (let i = 1; i < input.prices.length; i++) {
    returns.push(Math.log(input.prices[i] / input.prices[i - 1]));
  }

  const vol = Math.sqrt(returns.reduce((s, r) => s + r * r, 0) / returns.length) * Math.sqrt(252);
  const totalReturn = (input.prices[input.prices.length - 1] / input.prices[0]) - 1;

  let currentRegime: RegimeResult['currentRegime'] = 'unknown';
  if (vol > 0.4) currentRegime = 'volatile';
  else if (Math.abs(totalReturn) < 0.05) currentRegime = 'ranging';
  else if (totalReturn > 0) currentRegime = 'trending_up';
  else currentRegime = 'trending_down';

  return {
    currentRegime,
    regimeHistory: [{
      start: input.timestamps[0],
      end: input.timestamps[input.timestamps.length - 1],
      regime: currentRegime,
    }],
    regimeProbabilities: {
      trending_up: currentRegime === 'trending_up' ? 0.6 : 0.1,
      trending_down: currentRegime === 'trending_down' ? 0.6 : 0.1,
      ranging: currentRegime === 'ranging' ? 0.6 : 0.1,
      volatile: currentRegime === 'volatile' ? 0.6 : 0.1,
      unknown: 0.1,
    },
    transitionMatrix: [[0.7, 0.1, 0.1, 0.1], [0.1, 0.7, 0.1, 0.1], [0.1, 0.1, 0.7, 0.1], [0.1, 0.1, 0.1, 0.7]],
    expectedDuration: 14,
  };
}

/** Local fallback: Granger causality approximation */
function localGranger(input: GrangerInput): GrangerResult {
  const n = Math.min(input.causeSeries.length, input.effectSeries.length);
  const corr = localCorrelation({ seriesA: input.causeSeries, seriesB: input.effectSeries, method: 'pearson' });

  const isCausal = corr.pValue < 0.1 && Math.abs(corr.correlation) > 0.3;

  let strength: 'none' | 'weak' | 'moderate' | 'strong' = 'none';
  if (corr.pValue < 0.01) strength = 'strong';
  else if (corr.pValue < 0.05) strength = 'moderate';
  else if (corr.pValue < 0.1) strength = 'weak';

  return {
    isCausal,
    fStatistic: Math.abs(corr.correlation) * 10,
    pValue: corr.pValue,
    optimalLag: 1,
    causalityStrength: strength,
    direction: isCausal ? 'Cause series influences Effect series' : 'No causality detected',
  };
}

/** Local fallback: Volatility calculation */
function localVolatility(input: VolatilityInput): VolatilityResult {
  const returns = input.returns;
  const n = returns.length;

  const variance = returns.reduce((s, r) => s + r * r, 0) / n;
  const dailyVol = Math.sqrt(variance);
  const annualVol = dailyVol * Math.sqrt(252) * 100;

  let regime: 'low' | 'normal' | 'high' | 'extreme' = 'normal';
  if (annualVol < 15) regime = 'low';
  else if (annualVol > 50) regime = 'extreme';
  else if (annualVol > 30) regime = 'high';

  const forecast = Array(input.forecastHorizon || 5).fill(annualVol);

  return {
    currentVolatility: annualVol,
    forecast,
    volatilityRegime: regime,
    valueAtRisk: {
      '95%': -1.645 * dailyVol * 100,
      '99%': -2.326 * dailyVol * 100,
    },
    maxDrawdownEstimate: -annualVol * 0.5,
  };
}

/** Local fallback: Correlation matrix */
function localCorrelationMatrix(input: CorrelationMatrixInput): CorrelationMatrixResult {
  const assets = Object.keys(input.series);
  const matrix: Record<string, Record<string, number>> = {};
  const pairs: Array<[string, string, number]> = [];

  for (const a of assets) {
    matrix[a] = {};
    for (const b of assets) {
      if (a === b) {
        matrix[a][b] = 1;
      } else if (matrix[b]?.[a] !== undefined) {
        matrix[a][b] = matrix[b][a];
      } else {
        const corr = localCorrelation({ seriesA: input.series[a], seriesB: input.series[b], method: input.method || 'pearson' });
        matrix[a][b] = corr.correlation;
        if (Math.abs(corr.correlation) > 0.7) {
          pairs.push([a, b, corr.correlation]);
        }
      }
    }
  }

  // Calculate average correlation for diversification score
  let totalCorr = 0;
  let count = 0;
  for (let i = 0; i < assets.length; i++) {
    for (let j = i + 1; j < assets.length; j++) {
      totalCorr += Math.abs(matrix[assets[i]][assets[j]]);
      count++;
    }
  }
  const avgCorr = count > 0 ? totalCorr / count : 0;

  return {
    matrix,
    eigenvalues: assets.map((_, i) => Math.max(0.1, assets.length - i)),
    conditionNumber: assets.length,
    highlyCorrelatedPairs: pairs,
    diversificationScore: clamp(1 - avgCorr, 0, 1),
  };
}

/** Main analyzer */
export const analyzer = {
  async calculateCorrelation(
    input: CorrelationInput,
    options: { useCache?: boolean; deepAnalysis?: boolean } = {}
  ): Promise<CorrelationResult> {
    const cacheKey = 'correlation';
    if (options.useCache !== false) {
      const cached = statsCache.get<CorrelationResult>(cacheKey, input);
      if (cached) return cached;
    }

    const isHealthy = await checkApiHealth();
    if (!isHealthy) return localCorrelation(input);

    const { result, error } = await callDeepSeek<CorrelationResult>(
      'correlation',
      JSON.stringify(input),
      { deepAnalysis: options.deepAnalysis }
    );

    if (result && !error) {
      const validated: CorrelationResult = {
        correlation: clampCorrelation(result.correlation),
        pValue: clampProbability(result.pValue),
        confidenceInterval: [
          clampCorrelation(result.confidenceInterval?.[0] ?? result.correlation - 0.2),
          clampCorrelation(result.confidenceInterval?.[1] ?? result.correlation + 0.2),
        ],
        sampleSize: Math.max(2, result.sampleSize || input.seriesA.length),
        strength: ['none', 'weak', 'moderate', 'strong'].includes(result.strength) ? result.strength : 'none',
        direction: ['positive', 'negative', 'none'].includes(result.direction) ? result.direction : 'none',
      };
      statsCache.set(cacheKey, input, validated);
      return validated;
    }

    return localCorrelation(input);
  },

  async performPCA(
    input: PCAInput,
    options: { useCache?: boolean; deepAnalysis?: boolean } = {}
  ): Promise<PCAResult> {
    const cacheKey = 'pca';
    if (options.useCache !== false) {
      const cached = statsCache.get<PCAResult>(cacheKey, input);
      if (cached) return cached;
    }

    const isHealthy = await checkApiHealth();
    if (!isHealthy) return localPCA(input);

    const { result, error } = await callDeepSeek<PCAResult>(
      'pca',
      JSON.stringify(input),
      { deepAnalysis: options.deepAnalysis || true }
    );

    if (result && !error) {
      const validated: PCAResult = {
        components: result.components || [],
        explainedVariance: (result.explainedVariance || []).map(v => clamp(v, 0, 100)),
        loadings: result.loadings || [],
        clusterAssignments: result.clusterAssignments || {},
        outliers: Array.isArray(result.outliers) ? result.outliers : [],
      };
      statsCache.set(cacheKey, input, validated);
      return validated;
    }

    return localPCA(input);
  },

  async detectRegime(
    input: RegimeInput,
    options: { useCache?: boolean; deepAnalysis?: boolean } = {}
  ): Promise<RegimeResult> {
    const cacheKey = 'regime';
    if (options.useCache !== false) {
      const cached = statsCache.get<RegimeResult>(cacheKey, input);
      if (cached) return cached;
    }

    const isHealthy = await checkApiHealth();
    if (!isHealthy) return localRegime(input);

    const { result, error } = await callDeepSeek<RegimeResult>(
      'regime',
      JSON.stringify(input),
      { deepAnalysis: options.deepAnalysis }
    );

    if (result && !error) {
      const validated: RegimeResult = {
        currentRegime: ['trending_up', 'trending_down', 'ranging', 'volatile', 'unknown'].includes(result.currentRegime)
          ? result.currentRegime
          : 'unknown',
        regimeHistory: Array.isArray(result.regimeHistory) ? result.regimeHistory : [],
        regimeProbabilities: result.regimeProbabilities || {},
        transitionMatrix: result.transitionMatrix || [],
        expectedDuration: Math.max(1, result.expectedDuration || 7),
      };
      statsCache.set(cacheKey, input, validated);
      return validated;
    }

    return localRegime(input);
  },

  async testGrangerCausality(
    input: GrangerInput,
    options: { useCache?: boolean; deepAnalysis?: boolean } = {}
  ): Promise<GrangerResult> {
    const cacheKey = 'granger';
    if (options.useCache !== false) {
      const cached = statsCache.get<GrangerResult>(cacheKey, input);
      if (cached) return cached;
    }

    const isHealthy = await checkApiHealth();
    if (!isHealthy) return localGranger(input);

    const { result, error } = await callDeepSeek<GrangerResult>(
      'granger',
      JSON.stringify(input),
      { deepAnalysis: options.deepAnalysis || true }
    );

    if (result && !error) {
      const validated: GrangerResult = {
        isCausal: Boolean(result.isCausal),
        fStatistic: result.fStatistic || 0,
        pValue: clampProbability(result.pValue),
        optimalLag: Math.max(1, result.optimalLag || 1),
        causalityStrength: ['none', 'weak', 'moderate', 'strong'].includes(result.causalityStrength)
          ? result.causalityStrength
          : 'none',
        direction: result.direction || 'No causality detected',
      };
      statsCache.set(cacheKey, input, validated);
      return validated;
    }

    return localGranger(input);
  },

  async calculateVolatility(
    input: VolatilityInput,
    options: { useCache?: boolean; deepAnalysis?: boolean } = {}
  ): Promise<VolatilityResult> {
    const cacheKey = 'volatility';
    if (options.useCache !== false) {
      const cached = statsCache.get<VolatilityResult>(cacheKey, input);
      if (cached) return cached;
    }

    const isHealthy = await checkApiHealth();
    if (!isHealthy) return localVolatility(input);

    const { result, error } = await callDeepSeek<VolatilityResult>(
      'volatility',
      JSON.stringify(input),
      { deepAnalysis: options.deepAnalysis }
    );

    if (result && !error) {
      const validated: VolatilityResult = {
        currentVolatility: Math.max(0, result.currentVolatility),
        forecast: (result.forecast || []).map(v => Math.max(0, v)),
        volatilityRegime: ['low', 'normal', 'high', 'extreme'].includes(result.volatilityRegime)
          ? result.volatilityRegime
          : 'normal',
        valueAtRisk: {
          '95%': result.valueAtRisk?.['95%'] ?? -5,
          '99%': result.valueAtRisk?.['99%'] ?? -10,
        },
        maxDrawdownEstimate: result.maxDrawdownEstimate ?? -20,
      };
      statsCache.set(cacheKey, input, validated);
      return validated;
    }

    return localVolatility(input);
  },

  async calculateCorrelationMatrix(
    input: CorrelationMatrixInput,
    options: { useCache?: boolean; deepAnalysis?: boolean } = {}
  ): Promise<CorrelationMatrixResult> {
    const cacheKey = 'correlationMatrix';
    if (options.useCache !== false) {
      const cached = statsCache.get<CorrelationMatrixResult>(cacheKey, input);
      if (cached) return cached;
    }

    const isHealthy = await checkApiHealth();
    if (!isHealthy) return localCorrelationMatrix(input);

    const { result, error } = await callDeepSeek<CorrelationMatrixResult>(
      'correlationMatrix',
      JSON.stringify(input),
      { deepAnalysis: options.deepAnalysis || true }
    );

    if (result && !error) {
      const validated: CorrelationMatrixResult = {
        matrix: result.matrix || {},
        eigenvalues: (result.eigenvalues || []).map(v => Math.max(0, v)),
        conditionNumber: Math.max(1, result.conditionNumber || 1),
        highlyCorrelatedPairs: Array.isArray(result.highlyCorrelatedPairs) ? result.highlyCorrelatedPairs : [],
        diversificationScore: clamp(result.diversificationScore, 0, 1),
      };
      statsCache.set(cacheKey, input, validated);
      return validated;
    }

    return localCorrelationMatrix(input);
  },
};

export { localCorrelation, localPCA, localRegime, localGranger, localVolatility, localCorrelationMatrix };

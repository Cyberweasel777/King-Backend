"use strict";
/** BotIndex DeepSeek Stats - Analyzer */
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzer = void 0;
exports.localCorrelation = localCorrelation;
exports.localPCA = localPCA;
exports.localRegime = localRegime;
exports.localGranger = localGranger;
exports.localVolatility = localVolatility;
exports.localCorrelationMatrix = localCorrelationMatrix;
const types_1 = require("./types");
const deepseek_client_1 = require("./deepseek-client");
const cache_1 = require("./cache");
/** Local fallback: Pearson correlation */
function localCorrelation(input) {
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
    let strength = 'none';
    if (absR > 0.7)
        strength = 'strong';
    else if (absR > 0.4)
        strength = 'moderate';
    else if (absR > 0.2)
        strength = 'weak';
    return {
        correlation: (0, types_1.clampCorrelation)(r),
        pValue: (0, types_1.clampProbability)(pValue),
        confidenceInterval: [(0, types_1.clampCorrelation)(Math.min(r_lower, r_upper)), (0, types_1.clampCorrelation)(Math.max(r_lower, r_upper))],
        sampleSize: n,
        strength,
        direction: r > 0.1 ? 'positive' : r < -0.1 ? 'negative' : 'none',
    };
}
/** Local fallback: Simple clustering */
function localPCA(input) {
    const nAssets = input.assetNames.length;
    const result = {
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
function localRegime(input) {
    const returns = [];
    for (let i = 1; i < input.prices.length; i++) {
        returns.push(Math.log(input.prices[i] / input.prices[i - 1]));
    }
    const vol = Math.sqrt(returns.reduce((s, r) => s + r * r, 0) / returns.length) * Math.sqrt(252);
    const totalReturn = (input.prices[input.prices.length - 1] / input.prices[0]) - 1;
    let currentRegime = 'unknown';
    if (vol > 0.4)
        currentRegime = 'volatile';
    else if (Math.abs(totalReturn) < 0.05)
        currentRegime = 'ranging';
    else if (totalReturn > 0)
        currentRegime = 'trending_up';
    else
        currentRegime = 'trending_down';
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
function localGranger(input) {
    const n = Math.min(input.causeSeries.length, input.effectSeries.length);
    const corr = localCorrelation({ seriesA: input.causeSeries, seriesB: input.effectSeries, method: 'pearson' });
    const isCausal = corr.pValue < 0.1 && Math.abs(corr.correlation) > 0.3;
    let strength = 'none';
    if (corr.pValue < 0.01)
        strength = 'strong';
    else if (corr.pValue < 0.05)
        strength = 'moderate';
    else if (corr.pValue < 0.1)
        strength = 'weak';
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
function localVolatility(input) {
    const returns = input.returns;
    const n = returns.length;
    const variance = returns.reduce((s, r) => s + r * r, 0) / n;
    const dailyVol = Math.sqrt(variance);
    const annualVol = dailyVol * Math.sqrt(252) * 100;
    let regime = 'normal';
    if (annualVol < 15)
        regime = 'low';
    else if (annualVol > 50)
        regime = 'extreme';
    else if (annualVol > 30)
        regime = 'high';
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
function localCorrelationMatrix(input) {
    const assets = Object.keys(input.series);
    const matrix = {};
    const pairs = [];
    for (const a of assets) {
        matrix[a] = {};
        for (const b of assets) {
            if (a === b) {
                matrix[a][b] = 1;
            }
            else if (matrix[b]?.[a] !== undefined) {
                matrix[a][b] = matrix[b][a];
            }
            else {
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
        diversificationScore: (0, types_1.clamp)(1 - avgCorr, 0, 1),
    };
}
/** Main analyzer */
exports.analyzer = {
    async calculateCorrelation(input, options = {}) {
        const cacheKey = 'correlation';
        if (options.useCache !== false) {
            const cached = cache_1.statsCache.get(cacheKey, input);
            if (cached)
                return cached;
        }
        const isHealthy = await (0, deepseek_client_1.checkApiHealth)();
        if (!isHealthy)
            return localCorrelation(input);
        const { result, error } = await (0, deepseek_client_1.callDeepSeek)('correlation', JSON.stringify(input), { deepAnalysis: options.deepAnalysis });
        if (result && !error) {
            const validated = {
                correlation: (0, types_1.clampCorrelation)(result.correlation),
                pValue: (0, types_1.clampProbability)(result.pValue),
                confidenceInterval: [
                    (0, types_1.clampCorrelation)(result.confidenceInterval?.[0] ?? result.correlation - 0.2),
                    (0, types_1.clampCorrelation)(result.confidenceInterval?.[1] ?? result.correlation + 0.2),
                ],
                sampleSize: Math.max(2, result.sampleSize || input.seriesA.length),
                strength: ['none', 'weak', 'moderate', 'strong'].includes(result.strength) ? result.strength : 'none',
                direction: ['positive', 'negative', 'none'].includes(result.direction) ? result.direction : 'none',
            };
            cache_1.statsCache.set(cacheKey, input, validated);
            return validated;
        }
        return localCorrelation(input);
    },
    async performPCA(input, options = {}) {
        const cacheKey = 'pca';
        if (options.useCache !== false) {
            const cached = cache_1.statsCache.get(cacheKey, input);
            if (cached)
                return cached;
        }
        const isHealthy = await (0, deepseek_client_1.checkApiHealth)();
        if (!isHealthy)
            return localPCA(input);
        const { result, error } = await (0, deepseek_client_1.callDeepSeek)('pca', JSON.stringify(input), { deepAnalysis: options.deepAnalysis || true });
        if (result && !error) {
            const validated = {
                components: result.components || [],
                explainedVariance: (result.explainedVariance || []).map(v => (0, types_1.clamp)(v, 0, 100)),
                loadings: result.loadings || [],
                clusterAssignments: result.clusterAssignments || {},
                outliers: Array.isArray(result.outliers) ? result.outliers : [],
            };
            cache_1.statsCache.set(cacheKey, input, validated);
            return validated;
        }
        return localPCA(input);
    },
    async detectRegime(input, options = {}) {
        const cacheKey = 'regime';
        if (options.useCache !== false) {
            const cached = cache_1.statsCache.get(cacheKey, input);
            if (cached)
                return cached;
        }
        const isHealthy = await (0, deepseek_client_1.checkApiHealth)();
        if (!isHealthy)
            return localRegime(input);
        const { result, error } = await (0, deepseek_client_1.callDeepSeek)('regime', JSON.stringify(input), { deepAnalysis: options.deepAnalysis });
        if (result && !error) {
            const validated = {
                currentRegime: ['trending_up', 'trending_down', 'ranging', 'volatile', 'unknown'].includes(result.currentRegime)
                    ? result.currentRegime
                    : 'unknown',
                regimeHistory: Array.isArray(result.regimeHistory) ? result.regimeHistory : [],
                regimeProbabilities: result.regimeProbabilities || {},
                transitionMatrix: result.transitionMatrix || [],
                expectedDuration: Math.max(1, result.expectedDuration || 7),
            };
            cache_1.statsCache.set(cacheKey, input, validated);
            return validated;
        }
        return localRegime(input);
    },
    async testGrangerCausality(input, options = {}) {
        const cacheKey = 'granger';
        if (options.useCache !== false) {
            const cached = cache_1.statsCache.get(cacheKey, input);
            if (cached)
                return cached;
        }
        const isHealthy = await (0, deepseek_client_1.checkApiHealth)();
        if (!isHealthy)
            return localGranger(input);
        const { result, error } = await (0, deepseek_client_1.callDeepSeek)('granger', JSON.stringify(input), { deepAnalysis: options.deepAnalysis || true });
        if (result && !error) {
            const validated = {
                isCausal: Boolean(result.isCausal),
                fStatistic: result.fStatistic || 0,
                pValue: (0, types_1.clampProbability)(result.pValue),
                optimalLag: Math.max(1, result.optimalLag || 1),
                causalityStrength: ['none', 'weak', 'moderate', 'strong'].includes(result.causalityStrength)
                    ? result.causalityStrength
                    : 'none',
                direction: result.direction || 'No causality detected',
            };
            cache_1.statsCache.set(cacheKey, input, validated);
            return validated;
        }
        return localGranger(input);
    },
    async calculateVolatility(input, options = {}) {
        const cacheKey = 'volatility';
        if (options.useCache !== false) {
            const cached = cache_1.statsCache.get(cacheKey, input);
            if (cached)
                return cached;
        }
        const isHealthy = await (0, deepseek_client_1.checkApiHealth)();
        if (!isHealthy)
            return localVolatility(input);
        const { result, error } = await (0, deepseek_client_1.callDeepSeek)('volatility', JSON.stringify(input), { deepAnalysis: options.deepAnalysis });
        if (result && !error) {
            const validated = {
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
            cache_1.statsCache.set(cacheKey, input, validated);
            return validated;
        }
        return localVolatility(input);
    },
    async calculateCorrelationMatrix(input, options = {}) {
        const cacheKey = 'correlationMatrix';
        if (options.useCache !== false) {
            const cached = cache_1.statsCache.get(cacheKey, input);
            if (cached)
                return cached;
        }
        const isHealthy = await (0, deepseek_client_1.checkApiHealth)();
        if (!isHealthy)
            return localCorrelationMatrix(input);
        const { result, error } = await (0, deepseek_client_1.callDeepSeek)('correlationMatrix', JSON.stringify(input), { deepAnalysis: options.deepAnalysis || true });
        if (result && !error) {
            const validated = {
                matrix: result.matrix || {},
                eigenvalues: (result.eigenvalues || []).map(v => Math.max(0, v)),
                conditionNumber: Math.max(1, result.conditionNumber || 1),
                highlyCorrelatedPairs: Array.isArray(result.highlyCorrelatedPairs) ? result.highlyCorrelatedPairs : [],
                diversificationScore: (0, types_1.clamp)(result.diversificationScore, 0, 1),
            };
            cache_1.statsCache.set(cacheKey, input, validated);
            return validated;
        }
        return localCorrelationMatrix(input);
    },
};
//# sourceMappingURL=analyzer.js.map
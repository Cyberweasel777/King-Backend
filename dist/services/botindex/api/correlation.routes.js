"use strict";
/**
 * BotIndex Correlation API Routes
 * Express.js routes for correlation analysis endpoints
 */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const matrix_1 = require("../engine/matrix");
const correlation_1 = require("../engine/correlation");
const fetcher_1 = require("../engine/fetcher");
const correlation_cache_1 = require("./correlation.cache");
const stats_1 = require("../stats");
const router = (0, express_1.Router)();
// Default AI-agent token universe (can be configured)
const DEFAULT_TOKEN_UNIVERSE = [
    'solana:So11111111111111111111111111111111111111112', // SOL
    'solana:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
    'solana:Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
    'solana:DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', // BONK
    'solana:EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', // WIF
    'solana:7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', // SAMO
    'solana:6D7NaBmqsFEK14vgtgBaHwLxBozrMBF3ZgJy5mR8yXrw', // MYRO
];
// Cache TTL in milliseconds (15 minutes)
const CACHE_TTL = 15 * 60 * 1000;
// Cache storage
const pairCache = new Map();
const matrixCache = new Map();
/**
 * GET /correlation/:tokenA/:tokenB
 * Get specific pair correlation
 */
router.get('/correlation/:tokenA/:tokenB', async (req, res) => {
    try {
        const { tokenA, tokenB } = req.params;
        const window = req.query.window || '24h';
        const useReturns = req.query.returns !== 'false';
        // Validate window
        if (!matrix_1.TIME_WINDOWS[window]) {
            res.status(400).json({
                error: 'Invalid window. Use: 1h, 24h, 7d, 30d'
            });
            return;
        }
        // Check cache first
        const cacheKey = `${tokenA}:${tokenB}:${window}:${useReturns}`;
        const cached = pairCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
            res.json(formatPairResponse(cached.result));
            return;
        }
        // Fetch price series (prefer GeckoTerminal OHLCV, fallback to DEXScreener)
        const [seriesA, seriesB] = await Promise.all([
            (0, fetcher_1.fetchPriceSeries)(tokenA, window, 'fallback'),
            (0, fetcher_1.fetchPriceSeries)(tokenB, window, 'fallback')
        ]);
        if (!seriesA || !seriesB) {
            res.status(404).json({
                error: 'Price data not available for one or both tokens'
            });
            return;
        }
        // Calculate correlation
        const result = (0, correlation_1.calculateCorrelation)(seriesA, seriesB, {
            useReturns,
            window: matrix_1.TIME_WINDOWS[window].hours
        });
        if (!result || typeof result.sampleSize !== 'number' || result.sampleSize < 3) {
            res.status(422).json({
                error: 'insufficient_overlap',
                message: 'Insufficient overlapping price samples to calculate a reliable correlation'
            });
            return;
        }
        // Preserve caller token ids (including chain prefix) in response.
        const normalizedResult = {
            ...result,
            tokenA,
            tokenB,
        };
        // Cache result
        pairCache.set(cacheKey, { result: normalizedResult, expiresAt: Date.now() + CACHE_TTL });
        res.json(formatPairResponse(normalizedResult));
    }
    catch (error) {
        console.error('Correlation pair error:', error);
        res.status(500).json({
            error: 'Failed to calculate correlation',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
/**
 * GET /correlation/deep/:tokenA/:tokenB
 * DeepSeek AI-enhanced correlation analysis
 */
router.get('/correlation/deep/:tokenA/:tokenB', async (req, res) => {
    try {
        const { tokenA, tokenB } = req.params;
        const window = req.query.window || '24h';
        // Validate window
        if (!matrix_1.TIME_WINDOWS[window]) {
            res.status(400).json({
                error: 'Invalid window. Use: 1h, 24h, 7d, 30d'
            });
            return;
        }
        // Fetch price series (prefer GeckoTerminal OHLCV, fallback to DEXScreener)
        const [seriesA, seriesB] = await Promise.all([
            (0, fetcher_1.fetchPriceSeries)(tokenA, window, 'fallback'),
            (0, fetcher_1.fetchPriceSeries)(tokenB, window, 'fallback')
        ]);
        if (!seriesA || !seriesB) {
            res.status(404).json({
                error: 'Price data not available for one or both tokens'
            });
            return;
        }
        // Calculate local correlation first
        const localResult = (0, correlation_1.calculateCorrelation)(seriesA, seriesB, {
            useReturns: true,
            window: matrix_1.TIME_WINDOWS[window].hours
        });
        // Enhance with DeepSeek analysis
        const deepseekResult = await stats_1.analyzer.calculateCorrelation({
            seriesA: seriesA.data.map((p) => p.close),
            seriesB: seriesB.data.map((p) => p.close),
            method: 'pearson'
        }, { deepAnalysis: true });
        // Build enhanced response
        const response = {
            tokenA,
            tokenB,
            window,
            localAnalysis: {
                correlation: Math.round(localResult.coefficient * 1000) / 1000,
                significance: Math.round(localResult.significance * 1000) / 1000,
                relationship: localResult.relationship,
                sampleSize: localResult.sampleSize
            },
            aiAnalysis: {
                correlation: deepseekResult.correlation,
                // confidence proxy: lower pValue => higher confidence
                confidence: 1 - deepseekResult.pValue,
                strength: deepseekResult.strength,
                direction: deepseekResult.direction,
                pValue: deepseekResult.pValue,
                confidenceInterval: deepseekResult.confidenceInterval
            },
            insights: generateDeepInsights(localResult, deepseekResult, tokenA, tokenB),
            generatedAt: new Date().toISOString()
        };
        res.json(response);
    }
    catch (error) {
        console.error('Deep correlation error:', error);
        // Graceful degradation: return local correlation if DeepSeek fails
        res.status(500).json({
            error: 'Deep analysis failed',
            message: error instanceof Error ? error.message : 'Unknown error',
            note: 'Fallback to /correlation/:tokenA/:tokenB for local analysis'
        });
    }
});
/**
 * GET /correlation/matrix
 * Get full correlation matrix for token universe
 */
router.get('/correlation/matrix', async (req, res) => {
    try {
        const window = req.query.window || '24h';
        const includeClusters = req.query.clusters !== 'false';
        const includeAnomalies = req.query.anomalies !== 'false';
        // Custom token universe from query or use default
        const tokens = req.query.tokens?.split(',') || DEFAULT_TOKEN_UNIVERSE;
        // Validate window
        if (!matrix_1.TIME_WINDOWS[window]) {
            res.status(400).json({
                error: 'Invalid window. Use: 1h, 24h, 7d, 30d'
            });
            return;
        }
        // Check cache
        const cacheKey = `matrix:${window}:${tokens.sort().join(',')}`;
        const cached = matrixCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
            res.json(cached.data);
            return;
        }
        // Fetch all price series
        const priceSeriesMap = await (0, fetcher_1.fetchMultiplePriceSeries)(tokens, window);
        const priceSeries = Array.from(priceSeriesMap.values());
        if (priceSeries.length < 2) {
            res.status(400).json({
                error: 'Insufficient price data. At least 2 tokens required.'
            });
            return;
        }
        // Generate correlation matrix
        const matrix = (0, matrix_1.generateCorrelationMatrix)(priceSeries, window);
        // AI-enhanced regime detection for each token
        let regimeAnalysis = {};
        try {
            regimeAnalysis = await analyzeMatrixRegimes(priceSeries);
        }
        catch (error) {
            console.warn('Regime analysis failed, continuing without:', error);
            // Graceful degradation - continue without regime data
        }
        // Build response
        const response = {
            tokens: matrix.tokens,
            matrix: matrix.matrix,
            clusters: includeClusters ? matrix.clusters.map(c => ({
                id: c.id,
                tokens: c.tokens,
                avgCorrelation: c.avgInternalCorrelation,
                cohesion: c.cohesion
            })) : [],
            anomalies: includeAnomalies ? matrix.anomalies.map(a => ({
                pair: `${a.tokenA}-${a.tokenB}`,
                current: a.currentCorrelation,
                expected: a.expectedCorrelation,
                severity: a.severity
            })) : [],
            regimeAnalysis: Object.keys(regimeAnalysis).length > 0 ? regimeAnalysis : undefined,
            window: matrix.window,
            generatedAt: new Date(matrix.generatedAt).toISOString()
        };
        // Cache response
        matrixCache.set(cacheKey, { data: response, expiresAt: Date.now() + CACHE_TTL });
        res.json(response);
    }
    catch (error) {
        console.error('Correlation matrix error:', error);
        res.status(500).json({
            error: 'Failed to generate correlation matrix',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
/**
 * GET /correlation/leaders
 * Get tokens that lead the market
 */
router.get('/correlation/leaders', async (req, res) => {
    try {
        const window = req.query.window || '24h';
        const limit = parseInt(req.query.limit) || 10;
        const minLeadScore = parseInt(req.query.minScore) || 0;
        // Custom token universe
        const tokens = req.query.tokens?.split(',') || DEFAULT_TOKEN_UNIVERSE;
        // Validate window
        if (!matrix_1.TIME_WINDOWS[window]) {
            res.status(400).json({
                error: 'Invalid window. Use: 1h, 24h, 7d, 30d'
            });
            return;
        }
        // Check cache
        const cacheKey = `leaders:${window}:${tokens.sort().join(',')}`;
        const cached = matrixCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
            const filtered = cached.data.leaders
                .filter((l) => l.leadScore >= minLeadScore)
                .slice(0, limit);
            res.json({ ...cached.data, leaders: filtered });
            return;
        }
        // Fetch all price series
        const priceSeriesMap = await (0, fetcher_1.fetchMultiplePriceSeries)(tokens, window);
        const priceSeries = Array.from(priceSeriesMap.values());
        if (priceSeries.length < 2) {
            res.status(400).json({
                error: 'Insufficient price data'
            });
            return;
        }
        // Identify market leaders
        const leaders = (0, matrix_1.identifyMarketLeaders)(priceSeries)
            .filter(l => l.leadScore >= minLeadScore)
            .slice(0, limit);
        const response = {
            leaders: leaders.map(l => ({
                token: l.token,
                leadScore: l.leadScore,
                avgLeadTime: l.avgLeadTime,
                numLedTokens: l.numLedTokens,
                causalityStrength: l.causalityStrength
            })),
            calculatedAt: new Date().toISOString()
        };
        // Cache response
        matrixCache.set(cacheKey, { data: response, expiresAt: Date.now() + CACHE_TTL });
        res.json(response);
    }
    catch (error) {
        console.error('Market leaders error:', error);
        res.status(500).json({
            error: 'Failed to identify market leaders',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
/**
 * GET /correlation/top
 * Get top correlated pairs
 */
router.get('/correlation/top', async (req, res) => {
    try {
        const window = req.query.window || '24h';
        const limit = parseInt(req.query.limit) || 10;
        const positiveOnly = req.query.positive !== 'false';
        const tokens = req.query.tokens?.split(',') || DEFAULT_TOKEN_UNIVERSE;
        // Check cache
        const cacheKey = `matrix:${window}:${tokens.sort().join(',')}`;
        let matrix = matrixCache.get(cacheKey)?.data;
        // If not cached, generate matrix
        if (!matrix) {
            const priceSeriesMap = await (0, fetcher_1.fetchMultiplePriceSeries)(tokens, window);
            const priceSeries = Array.from(priceSeriesMap.values());
            if (priceSeries.length < 2) {
                res.status(400).json({ error: 'Insufficient price data' });
                return;
            }
            matrix = (0, matrix_1.generateCorrelationMatrix)(priceSeries, window);
        }
        const topPairs = (0, matrix_1.getTopCorrelatedPairs)(matrix, limit, positiveOnly);
        res.json({
            pairs: topPairs.map(p => ({
                tokenA: p.tokenA,
                tokenB: p.tokenB,
                correlation: p.correlation,
                significance: p.significance,
                relationship: p.relationship
            })),
            window,
            generatedAt: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Top pairs error:', error);
        res.status(500).json({
            error: 'Failed to get top correlated pairs',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
/**
 * POST /correlation/calculate
 * Trigger recalculation of correlations
 */
router.post('/correlation/calculate', async (req, res) => {
    try {
        const { type = 'full_matrix', window = '24h', tokens = DEFAULT_TOKEN_UNIVERSE, priority = 5 } = req.body;
        // Validate type
        const validTypes = ['full_matrix', 'pair_correlation', 'leadership_analysis'];
        if (!validTypes.includes(type)) {
            res.status(400).json({
                error: `Invalid type. Use: ${validTypes.join(', ')}`
            });
            return;
        }
        // Submit job
        const job = await (0, correlation_cache_1.submitJob)({
            type,
            params: { window, tokens },
            priority
        });
        const response = {
            jobId: job.id,
            status: job.status,
            message: `Calculation job submitted. Type: ${type}, Window: ${window}`,
            estimatedCompletion: new Date(Date.now() + 30000).toISOString() // 30s estimate
        };
        res.status(202).json(response);
    }
    catch (error) {
        console.error('Calculate trigger error:', error);
        res.status(500).json({
            error: 'Failed to submit calculation job',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
/**
 * GET /correlation/jobs/:jobId
 * Get status of a calculation job
 */
router.get('/correlation/jobs/:jobId', (req, res) => {
    try {
        const { jobId } = req.params;
        const job = (0, correlation_cache_1.getJobStatus)(jobId);
        if (!job) {
            res.status(404).json({ error: 'Job not found' });
            return;
        }
        res.json({
            id: job.id,
            type: job.type,
            status: job.status,
            params: job.params,
            result: job.result,
            error: job.error,
            startedAt: job.startedAt ? new Date(job.startedAt).toISOString() : undefined,
            completedAt: job.completedAt ? new Date(job.completedAt).toISOString() : undefined,
            runtime: job.completedAt && job.startedAt
                ? job.completedAt - job.startedAt
                : job.startedAt
                    ? Date.now() - job.startedAt
                    : 0
        });
    }
    catch (error) {
        console.error('Job status error:', error);
        res.status(500).json({
            error: 'Failed to get job status',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
/**
 * GET /correlation/stats
 * Get correlation matrix statistics
 */
router.get('/correlation/stats', async (req, res) => {
    try {
        const window = req.query.window || '24h';
        const tokens = req.query.tokens?.split(',') || DEFAULT_TOKEN_UNIVERSE;
        // Check cache
        const cacheKey = `matrix:${window}:${tokens.sort().join(',')}`;
        let matrix = matrixCache.get(cacheKey)?.data;
        // If not cached, generate matrix
        if (!matrix) {
            const priceSeriesMap = await (0, fetcher_1.fetchMultiplePriceSeries)(tokens, window);
            const priceSeries = Array.from(priceSeriesMap.values());
            if (priceSeries.length < 2) {
                res.status(400).json({ error: 'Insufficient price data' });
                return;
            }
            matrix = (0, matrix_1.generateCorrelationMatrix)(priceSeries, window);
        }
        const stats = (0, matrix_1.calculateMatrixStats)(matrix);
        res.json({
            ...stats,
            tokenCount: matrix.tokens.length,
            window: matrix.window,
            generatedAt: new Date(matrix.generatedAt).toISOString()
        });
    }
    catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({
            error: 'Failed to calculate matrix statistics',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
/**
 * DELETE /correlation/cache
 * Clear correlation cache (admin endpoint)
 */
router.delete('/correlation/cache', (_req, res) => {
    // In production, add authentication here
    pairCache.clear();
    matrixCache.clear();
    res.json({ message: 'Cache cleared successfully' });
});
// Helper function to generate AI insights from correlation data
function generateDeepInsights(localResult, aiResult, tokenA, tokenB) {
    const insights = {
        summary: '',
        tradingImplications: [],
        riskFactors: [],
        confidenceAssessment: ''
    };
    // Summary based on AI correlation strength
    const strength = aiResult.strength;
    const direction = aiResult.direction;
    const correlation = aiResult.correlation;
    if (strength === 'strong') {
        insights.summary = `${tokenA} and ${tokenB} exhibit a strong ${direction} correlation (${correlation.toFixed(2)}). Price movements are highly synchronized.`;
        insights.tradingImplications.push('Suitable for pairs trading strategies');
        insights.tradingImplications.push('Divergences may present mean-reversion opportunities');
    }
    else if (strength === 'moderate') {
        insights.summary = `Moderate ${direction} correlation (${correlation.toFixed(2)}) exists between ${tokenA} and ${tokenB}.`;
        insights.tradingImplications.push('Some predictive value for directional moves');
        insights.tradingImplications.push('Consider other factors in trading decisions');
    }
    else if (strength === 'weak') {
        insights.summary = `Weak correlation (${correlation.toFixed(2)}) suggests limited relationship between ${tokenA} and ${tokenB}.`;
        insights.tradingImplications.push('Good for portfolio diversification');
        insights.tradingImplications.push('Independent market factors at play');
    }
    else {
        insights.summary = `No significant correlation detected between ${tokenA} and ${tokenB}.`;
        insights.tradingImplications.push('Tokens move independently');
        insights.tradingImplications.push('Minimum diversification benefit');
    }
    // Risk factors
    if (Math.abs(correlation) > 0.8) {
        insights.riskFactors.push('High correlation increases portfolio concentration risk');
    }
    if (aiResult.confidence < 0.7) {
        insights.riskFactors.push('Low confidence in correlation estimate due to limited data');
    }
    if (localResult.significance > 0.05) {
        insights.riskFactors.push('Correlation may not be statistically significant');
    }
    // Confidence assessment
    const confidencePct = Math.round(aiResult.confidence * 100);
    if (confidencePct >= 80) {
        insights.confidenceAssessment = `High confidence (${confidencePct}%) - AI model strongly supports this correlation estimate`;
    }
    else if (confidencePct >= 60) {
        insights.confidenceAssessment = `Moderate confidence (${confidencePct}%) - Correlation estimate is reasonably reliable`;
    }
    else {
        insights.confidenceAssessment = `Low confidence (${confidencePct}%) - Treat correlation with caution`;
    }
    return insights;
}
// Helper function to format pair response
function formatPairResponse(result) {
    return {
        tokenA: result.tokenA,
        tokenB: result.tokenB,
        correlation: Math.round(result.coefficient * 1000) / 1000,
        significance: Math.round(result.significance * 1000) / 1000,
        relationship: result.relationship,
        sampleSize: result.sampleSize,
        leadLag: {
            optimalLag: result.leadLag.optimalLag,
            maxCorrelation: Math.round(result.leadLag.maxCorrelation * 1000) / 1000,
            isLeading: !result.leadLag.isASecond,
            causalityStrength: result.leadLag.causalityStrength,
            avgLeadTime: result.leadLag.avgLeadTime
        },
        rolling: [
            {
                window: '24h',
                data: result.rolling.map((r) => ({
                    timestamp: r.timestamp,
                    correlation: Math.round(r.correlation * 1000) / 1000
                }))
            }
        ],
        calculatedAt: new Date(result.calculatedAt).toISOString()
    };
}
/**
 * Analyze market regimes for each token in the matrix using DeepSeek
 */
async function analyzeMatrixRegimes(priceSeries) {
    const regimes = {};
    for (const series of priceSeries) {
        try {
            const regimeResult = await stats_1.analyzer.detectRegime({
                prices: series.prices,
                timestamps: series.timestamps || series.prices.map((_, i) => Date.now() - (series.prices.length - i) * 3600000),
                lookbackDays: 30
            }, { deepAnalysis: false }); // Use fast mode for matrix generation
            regimes[series.token] = {
                currentRegime: regimeResult.currentRegime,
                regimeProbabilities: regimeResult.regimeProbabilities,
                expectedDuration: regimeResult.expectedDuration
            };
        }
        catch (error) {
            // Graceful degradation - skip this token's regime analysis
            console.warn(`Failed to analyze regime for ${series.token}:`, error);
        }
    }
    return regimes;
}
exports.default = router;
//# sourceMappingURL=correlation.routes.js.map
"use strict";
/**
 * BotIndex Correlation Cache & Job Management
 * Background job processing and caching layer
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitJob = submitJob;
exports.getJobStatus = getJobStatus;
exports.getCachedCorrelation = getCachedCorrelation;
exports.setCachedCorrelation = setCachedCorrelation;
exports.getCache = getCache;
exports.setCache = setCache;
exports.getCachedMatrix = getCachedMatrix;
exports.cleanExpiredCache = cleanExpiredCache;
exports.getCacheStats = getCacheStats;
exports.clearAllCaches = clearAllCaches;
const matrix_1 = require("../engine/matrix");
const correlation_1 = require("../engine/correlation");
const fetcher_1 = require("../engine/fetcher");
// Job queue
const jobQueue = [];
const jobResults = new Map();
let jobCounter = 0;
// Cache storage
const correlationCache = new Map();
const matrixCache = new Map();
const generalCache = new Map();
// Default cache TTL: 15 minutes
const DEFAULT_CACHE_TTL = 15 * 60 * 1000;
/**
 * Submit a new calculation job
 * @param params - Job parameters
 * @returns Created job
 */
async function submitJob(params) {
    const job = {
        id: `job-${++jobCounter}-${Date.now()}`,
        type: params.type,
        status: 'pending',
        params: params.params,
        priority: params.priority || 5
    };
    jobQueue.push(job);
    jobResults.set(job.id, job);
    // Sort queue by priority (lower = higher priority)
    jobQueue.sort((a, b) => a.priority - b.priority);
    // Process queue asynchronously
    processQueue();
    return job;
}
/**
 * Get job status
 * @param jobId - Job identifier
 * @returns Job status or null
 */
function getJobStatus(jobId) {
    return jobResults.get(jobId) || null;
}
/**
 * Process job queue
 */
async function processQueue() {
    // Process one job at a time
    if (jobQueue.length === 0)
        return;
    const job = jobQueue.shift();
    if (!job || job.status !== 'pending')
        return;
    // Update status
    job.status = 'running';
    job.startedAt = Date.now();
    try {
        let result;
        switch (job.type) {
            case 'full_matrix':
                result = await calculateFullMatrix(job.params);
                break;
            case 'pair_correlation':
                result = await calculatePair(job.params);
                break;
            case 'leadership_analysis':
                result = await calculateLeadership(job.params);
                break;
            default:
                throw new Error(`Unknown job type: ${job.type}`);
        }
        job.status = 'completed';
        job.result = result;
        job.completedAt = Date.now();
    }
    catch (error) {
        job.status = 'failed';
        job.error = error instanceof Error ? error.message : 'Unknown error';
        job.completedAt = Date.now();
        console.error(`Job ${job.id} failed:`, error);
    }
    // Process next job
    if (jobQueue.length > 0) {
        setTimeout(() => processQueue(), 100);
    }
}
/**
 * Calculate full correlation matrix
 */
async function calculateFullMatrix(params) {
    const { window, tokens } = params;
    // Fetch price series
    const priceSeriesMap = await (0, fetcher_1.fetchMultiplePriceSeries)(tokens, window);
    const priceSeries = Array.from(priceSeriesMap.values());
    if (priceSeries.length < 2) {
        throw new Error('Insufficient price data');
    }
    // Generate matrix
    const matrix = (0, matrix_1.generateCorrelationMatrix)(priceSeries, window);
    // Cache result
    const cacheKey = `matrix:${window}:${tokens.sort().join(',')}`;
    matrixCache.set(cacheKey, {
        matrix,
        cachedAt: Date.now(),
        expiresAt: Date.now() + DEFAULT_CACHE_TTL
    });
    return {
        tokens: matrix.tokens,
        matrixSize: matrix.matrix.length,
        clustersFound: matrix.clusters.length,
        anomaliesDetected: matrix.anomalies.length,
        generatedAt: matrix.generatedAt
    };
}
/**
 * Calculate pair correlation
 */
async function calculatePair(params) {
    const { tokenA, tokenB, window } = params;
    // Import fetcher dynamically to avoid circular deps
    const { fetchPriceSeries } = await Promise.resolve().then(() => __importStar(require('../engine/fetcher')));
    const [seriesA, seriesB] = await Promise.all([
        fetchPriceSeries(tokenA, window),
        fetchPriceSeries(tokenB, window)
    ]);
    if (!seriesA || !seriesB) {
        throw new Error('Price data not available');
    }
    const result = (0, correlation_1.calculateCorrelation)(seriesA, seriesB);
    // Cache result
    const cacheKey = `${tokenA}:${tokenB}:${window}`;
    correlationCache.set(cacheKey, {
        result,
        cachedAt: Date.now(),
        expiresAt: Date.now() + DEFAULT_CACHE_TTL
    });
    return {
        tokenA,
        tokenB,
        correlation: result.coefficient,
        relationship: result.relationship,
        calculatedAt: result.calculatedAt
    };
}
/**
 * Calculate leadership analysis
 */
async function calculateLeadership(params) {
    const { window, tokens } = params;
    const priceSeriesMap = await (0, fetcher_1.fetchMultiplePriceSeries)(tokens, window);
    const priceSeries = Array.from(priceSeriesMap.values());
    if (priceSeries.length < 2) {
        throw new Error('Insufficient price data');
    }
    const leaders = (0, matrix_1.identifyMarketLeaders)(priceSeries);
    return {
        leaders: leaders.slice(0, 10),
        totalTokens: tokens.length,
        analyzedTokens: priceSeries.length,
        calculatedAt: Date.now()
    };
}
/**
 * Get cached correlation
 * @param key - Cache key
 * @returns Cached correlation or null
 */
function getCachedCorrelation(key) {
    const cached = correlationCache.get(key);
    if (!cached)
        return null;
    // Clean expired entries
    if (cached.expiresAt < Date.now()) {
        correlationCache.delete(key);
        return null;
    }
    return { result: cached.result, expiresAt: cached.expiresAt };
}
/**
 * Set cached correlation
 * @param key - Cache key
 * @param result - Correlation result
 * @param ttl - Time to live in ms
 */
function setCachedCorrelation(key, result, ttl = DEFAULT_CACHE_TTL) {
    correlationCache.set(key, {
        result,
        cachedAt: Date.now(),
        expiresAt: Date.now() + ttl
    });
}
/**
 * Get general cache
 * @param key - Cache key
 * @returns Cached data or null
 */
function getCache(key) {
    const cached = generalCache.get(key);
    if (!cached)
        return null;
    if (cached.expiresAt < Date.now()) {
        generalCache.delete(key);
        return null;
    }
    return { data: cached.data, expiresAt: cached.expiresAt };
}
/**
 * Set general cache
 * @param key - Cache key
 * @param data - Data to cache
 * @param ttl - Time to live in ms
 */
function setCache(key, data, ttl = DEFAULT_CACHE_TTL) {
    generalCache.set(key, {
        data,
        expiresAt: Date.now() + ttl
    });
}
/**
 * Get matrix cache
 * @param key - Cache key
 * @returns Cached matrix or null
 */
function getCachedMatrix(key) {
    const cached = matrixCache.get(key);
    if (!cached)
        return null;
    if (cached.expiresAt < Date.now()) {
        matrixCache.delete(key);
        return null;
    }
    return { matrix: cached.matrix, expiresAt: cached.expiresAt };
}
/**
 * Clean expired cache entries
 */
function cleanExpiredCache() {
    const now = Date.now();
    for (const [key, entry] of correlationCache.entries()) {
        if (entry.expiresAt < now) {
            correlationCache.delete(key);
        }
    }
    for (const [key, entry] of matrixCache.entries()) {
        if (entry.expiresAt < now) {
            matrixCache.delete(key);
        }
    }
    for (const [key, entry] of generalCache.entries()) {
        if (entry.expiresAt < now) {
            generalCache.delete(key);
        }
    }
}
/**
 * Get cache statistics
 */
function getCacheStats() {
    const jobs = Array.from(jobResults.values());
    return {
        correlationCacheSize: correlationCache.size,
        matrixCacheSize: matrixCache.size,
        generalCacheSize: generalCache.size,
        pendingJobs: jobs.filter(j => j.status === 'pending').length,
        completedJobs: jobs.filter(j => j.status === 'completed').length,
        failedJobs: jobs.filter(j => j.status === 'failed').length
    };
}
/**
 * Clear all caches
 */
function clearAllCaches() {
    correlationCache.clear();
    matrixCache.clear();
    generalCache.clear();
    jobQueue.length = 0;
    jobResults.clear();
}
// Periodic cache cleanup (every 5 minutes)
setInterval(cleanExpiredCache, 5 * 60 * 1000);
//# sourceMappingURL=correlation.cache.js.map
/**
 * BotIndex Correlation Cache & Job Management
 * Background job processing and caching layer
 */

import { 
  generateCorrelationMatrix, 
  identifyMarketLeaders 
} from '../engine/matrix';
import { calculateCorrelation } from '../engine/correlation';
import { fetchMultiplePriceSeries } from '../engine/fetcher';
import type { 
  CalculationJob, 
  CorrelationMatrix,
  CorrelationResult
} from '../engine/types';

// Job queue
const jobQueue: CalculationJob[] = [];
const jobResults = new Map<string, CalculationJob>();
let jobCounter = 0;

// Cache storage
const correlationCache = new Map<string, {
  result: CorrelationResult;
  cachedAt: number;
  expiresAt: number;
}>();

const matrixCache = new Map<string, {
  matrix: CorrelationMatrix;
  cachedAt: number;
  expiresAt: number;
}>();

const generalCache = new Map<string, {
  data: any;
  expiresAt: number;
}>();

// Default cache TTL: 15 minutes
const DEFAULT_CACHE_TTL = 15 * 60 * 1000;

/**
 * Submit a new calculation job
 * @param params - Job parameters
 * @returns Created job
 */
export async function submitJob(params: {
  type: CalculationJob['type'];
  params: Record<string, any>;
  priority?: number;
}): Promise<CalculationJob> {
  const job: CalculationJob = {
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
export function getJobStatus(jobId: string): CalculationJob | null {
  return jobResults.get(jobId) || null;
}

/**
 * Process job queue
 */
async function processQueue(): Promise<void> {
  // Process one job at a time
  if (jobQueue.length === 0) return;

  const job = jobQueue.shift();
  if (!job || job.status !== 'pending') return;

  // Update status
  job.status = 'running';
  job.startedAt = Date.now();

  try {
    let result: any;

    switch (job.type) {
      case 'full_matrix':
        result = await calculateFullMatrix(job.params as { window: '1h' | '24h' | '7d' | '30d'; tokens: string[] });
        break;
      case 'pair_correlation':
        result = await calculatePair(job.params as { tokenA: string; tokenB: string; window: '1h' | '24h' | '7d' | '30d' });
        break;
      case 'leadership_analysis':
        result = await calculateLeadership(job.params as { window: '1h' | '24h' | '7d' | '30d'; tokens: string[] });
        break;
      default:
        throw new Error(`Unknown job type: ${job.type}`);
    }

    job.status = 'completed';
    job.result = result;
    job.completedAt = Date.now();
  } catch (error) {
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
async function calculateFullMatrix(params: {
  window: '1h' | '24h' | '7d' | '30d';
  tokens: string[];
}): Promise<any> {
  const { window, tokens } = params;

  // Fetch price series
  const priceSeriesMap = await fetchMultiplePriceSeries(tokens, window);
  const priceSeries = Array.from(priceSeriesMap.values());

  if (priceSeries.length < 2) {
    throw new Error('Insufficient price data');
  }

  // Generate matrix
  const matrix = generateCorrelationMatrix(priceSeries, window);

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
async function calculatePair(params: {
  tokenA: string;
  tokenB: string;
  window: '1h' | '24h' | '7d' | '30d';
}): Promise<any> {
  const { tokenA, tokenB, window } = params;

  // Import fetcher dynamically to avoid circular deps
  const { fetchPriceSeries } = await import('../engine/fetcher');

  const [seriesA, seriesB] = await Promise.all([
    fetchPriceSeries(tokenA, window),
    fetchPriceSeries(tokenB, window)
  ]);

  if (!seriesA || !seriesB) {
    throw new Error('Price data not available');
  }

  const result = calculateCorrelation(seriesA, seriesB);

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
async function calculateLeadership(params: {
  window: '1h' | '24h' | '7d' | '30d';
  tokens: string[];
}): Promise<any> {
  const { window, tokens } = params;

  const priceSeriesMap = await fetchMultiplePriceSeries(tokens, window);
  const priceSeries = Array.from(priceSeriesMap.values());

  if (priceSeries.length < 2) {
    throw new Error('Insufficient price data');
  }

  const leaders = identifyMarketLeaders(priceSeries);

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
export function getCachedCorrelation(key: string): {
  result: CorrelationResult;
  expiresAt: number;
} | null {
  const cached = correlationCache.get(key);
  if (!cached) return null;
  
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
export function setCachedCorrelation(
  key: string, 
  result: CorrelationResult, 
  ttl: number = DEFAULT_CACHE_TTL
): void {
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
export function getCache<T>(key: string): { data: T; expiresAt: number } | null {
  const cached = generalCache.get(key);
  if (!cached) return null;
  
  if (cached.expiresAt < Date.now()) {
    generalCache.delete(key);
    return null;
  }

  return { data: cached.data as T, expiresAt: cached.expiresAt };
}

/**
 * Set general cache
 * @param key - Cache key
 * @param data - Data to cache
 * @param ttl - Time to live in ms
 */
export function setCache<T>(
  key: string, 
  data: T, 
  ttl: number = DEFAULT_CACHE_TTL
): void {
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
export function getCachedMatrix(key: string): {
  matrix: CorrelationMatrix;
  expiresAt: number;
} | null {
  const cached = matrixCache.get(key);
  if (!cached) return null;
  
  if (cached.expiresAt < Date.now()) {
    matrixCache.delete(key);
    return null;
  }

  return { matrix: cached.matrix, expiresAt: cached.expiresAt };
}

/**
 * Clean expired cache entries
 */
export function cleanExpiredCache(): void {
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
export function getCacheStats(): {
  correlationCacheSize: number;
  matrixCacheSize: number;
  generalCacheSize: number;
  pendingJobs: number;
  completedJobs: number;
  failedJobs: number;
} {
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
export function clearAllCaches(): void {
  correlationCache.clear();
  matrixCache.clear();
  generalCache.clear();
  jobQueue.length = 0;
  jobResults.clear();
}

// Periodic cache cleanup (every 5 minutes)
setInterval(cleanExpiredCache, 5 * 60 * 1000);

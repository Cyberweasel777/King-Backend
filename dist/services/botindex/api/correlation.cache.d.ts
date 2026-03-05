/**
 * BotIndex Correlation Cache & Job Management
 * Background job processing and caching layer
 */
import type { CalculationJob, CorrelationMatrix, CorrelationResult } from '../engine/types';
/**
 * Submit a new calculation job
 * @param params - Job parameters
 * @returns Created job
 */
export declare function submitJob(params: {
    type: CalculationJob['type'];
    params: Record<string, any>;
    priority?: number;
}): Promise<CalculationJob>;
/**
 * Get job status
 * @param jobId - Job identifier
 * @returns Job status or null
 */
export declare function getJobStatus(jobId: string): CalculationJob | null;
/**
 * Get cached correlation
 * @param key - Cache key
 * @returns Cached correlation or null
 */
export declare function getCachedCorrelation(key: string): {
    result: CorrelationResult;
    expiresAt: number;
} | null;
/**
 * Set cached correlation
 * @param key - Cache key
 * @param result - Correlation result
 * @param ttl - Time to live in ms
 */
export declare function setCachedCorrelation(key: string, result: CorrelationResult, ttl?: number): void;
/**
 * Get general cache
 * @param key - Cache key
 * @returns Cached data or null
 */
export declare function getCache<T>(key: string): {
    data: T;
    expiresAt: number;
} | null;
/**
 * Set general cache
 * @param key - Cache key
 * @param data - Data to cache
 * @param ttl - Time to live in ms
 */
export declare function setCache<T>(key: string, data: T, ttl?: number): void;
/**
 * Get matrix cache
 * @param key - Cache key
 * @returns Cached matrix or null
 */
export declare function getCachedMatrix(key: string): {
    matrix: CorrelationMatrix;
    expiresAt: number;
} | null;
/**
 * Clean expired cache entries
 */
export declare function cleanExpiredCache(): void;
/**
 * Get cache statistics
 */
export declare function getCacheStats(): {
    correlationCacheSize: number;
    matrixCacheSize: number;
    generalCacheSize: number;
    pendingJobs: number;
    completedJobs: number;
    failedJobs: number;
};
/**
 * Clear all caches
 */
export declare function clearAllCaches(): void;
//# sourceMappingURL=correlation.cache.d.ts.map
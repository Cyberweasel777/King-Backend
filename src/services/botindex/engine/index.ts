/**
 * BotIndex Correlation Engine
 * Token-to-token correlation analysis for AI-agent tokens
 */

// Core correlation calculations
export {
  pearsonCorrelation,
  rollingCorrelation,
  crossCorrelation,
  calculateReturns,
  calculateCorrelation,
  detectAnomaly,
  calculatePValue,
  calculateBeta,
  batchCalculateCorrelations
} from './correlation';

// Matrix generation
export {
  generateCorrelationMatrix,
  identifyMarketLeaders,
  filterByCorrelation,
  getTopCorrelatedPairs,
  calculateMatrixStats,
  serializeMatrix,
  TIME_WINDOWS
} from './matrix';

// Price data fetching
export {
  fetchPriceSeries,
  fetchMultiplePriceSeries,
  getAggregatedPrice,
  searchTokens,
  clearPriceCache,
  getCacheStats
} from './fetcher';

// Cache & Job management
export {
  submitJob,
  getJobStatus,
  getCachedCorrelation,
  setCachedCorrelation,
  getCache,
  setCache,
  getCachedMatrix,
  cleanExpiredCache,
  getCacheStats as getJobCacheStats,
  clearAllCaches
} from '../api/correlation.cache';

// API Routes
export { default as correlationRoutes } from '../api/correlation.routes';

// Types
export type {
  OHLCVPoint,
  PriceSeries,
  CorrelationResult,
  LeadLagResult,
  MatrixEntry,
  CorrelationMatrix,
  TokenCluster,
  MatrixAnomaly,
  MarketLeader,
  CachedCorrelation,
  TimeWindow,
  PriceDataSource,
  CalculationJob,
  CorrelationPairResponse,
  CorrelationMatrixResponse,
  MarketLeadersResponse,
  CalculationTriggerResponse
} from './types';

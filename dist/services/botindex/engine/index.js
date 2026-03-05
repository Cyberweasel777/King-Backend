"use strict";
/**
 * BotIndex Correlation Engine
 * Token-to-token correlation analysis for AI-agent tokens
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.correlationRoutes = exports.clearAllCaches = exports.getJobCacheStats = exports.cleanExpiredCache = exports.getCachedMatrix = exports.setCache = exports.getCache = exports.setCachedCorrelation = exports.getCachedCorrelation = exports.getJobStatus = exports.submitJob = exports.getCacheStats = exports.clearPriceCache = exports.searchTokens = exports.getAggregatedPrice = exports.fetchMultiplePriceSeries = exports.fetchPriceSeries = exports.TIME_WINDOWS = exports.serializeMatrix = exports.calculateMatrixStats = exports.getTopCorrelatedPairs = exports.filterByCorrelation = exports.identifyMarketLeaders = exports.generateCorrelationMatrix = exports.batchCalculateCorrelations = exports.calculateBeta = exports.calculatePValue = exports.detectAnomaly = exports.calculateCorrelation = exports.calculateReturns = exports.crossCorrelation = exports.rollingCorrelation = exports.pearsonCorrelation = void 0;
// Core correlation calculations
var correlation_1 = require("./correlation");
Object.defineProperty(exports, "pearsonCorrelation", { enumerable: true, get: function () { return correlation_1.pearsonCorrelation; } });
Object.defineProperty(exports, "rollingCorrelation", { enumerable: true, get: function () { return correlation_1.rollingCorrelation; } });
Object.defineProperty(exports, "crossCorrelation", { enumerable: true, get: function () { return correlation_1.crossCorrelation; } });
Object.defineProperty(exports, "calculateReturns", { enumerable: true, get: function () { return correlation_1.calculateReturns; } });
Object.defineProperty(exports, "calculateCorrelation", { enumerable: true, get: function () { return correlation_1.calculateCorrelation; } });
Object.defineProperty(exports, "detectAnomaly", { enumerable: true, get: function () { return correlation_1.detectAnomaly; } });
Object.defineProperty(exports, "calculatePValue", { enumerable: true, get: function () { return correlation_1.calculatePValue; } });
Object.defineProperty(exports, "calculateBeta", { enumerable: true, get: function () { return correlation_1.calculateBeta; } });
Object.defineProperty(exports, "batchCalculateCorrelations", { enumerable: true, get: function () { return correlation_1.batchCalculateCorrelations; } });
// Matrix generation
var matrix_1 = require("./matrix");
Object.defineProperty(exports, "generateCorrelationMatrix", { enumerable: true, get: function () { return matrix_1.generateCorrelationMatrix; } });
Object.defineProperty(exports, "identifyMarketLeaders", { enumerable: true, get: function () { return matrix_1.identifyMarketLeaders; } });
Object.defineProperty(exports, "filterByCorrelation", { enumerable: true, get: function () { return matrix_1.filterByCorrelation; } });
Object.defineProperty(exports, "getTopCorrelatedPairs", { enumerable: true, get: function () { return matrix_1.getTopCorrelatedPairs; } });
Object.defineProperty(exports, "calculateMatrixStats", { enumerable: true, get: function () { return matrix_1.calculateMatrixStats; } });
Object.defineProperty(exports, "serializeMatrix", { enumerable: true, get: function () { return matrix_1.serializeMatrix; } });
Object.defineProperty(exports, "TIME_WINDOWS", { enumerable: true, get: function () { return matrix_1.TIME_WINDOWS; } });
// Price data fetching
var fetcher_1 = require("./fetcher");
Object.defineProperty(exports, "fetchPriceSeries", { enumerable: true, get: function () { return fetcher_1.fetchPriceSeries; } });
Object.defineProperty(exports, "fetchMultiplePriceSeries", { enumerable: true, get: function () { return fetcher_1.fetchMultiplePriceSeries; } });
Object.defineProperty(exports, "getAggregatedPrice", { enumerable: true, get: function () { return fetcher_1.getAggregatedPrice; } });
Object.defineProperty(exports, "searchTokens", { enumerable: true, get: function () { return fetcher_1.searchTokens; } });
Object.defineProperty(exports, "clearPriceCache", { enumerable: true, get: function () { return fetcher_1.clearPriceCache; } });
Object.defineProperty(exports, "getCacheStats", { enumerable: true, get: function () { return fetcher_1.getCacheStats; } });
// Cache & Job management
var correlation_cache_1 = require("../api/correlation.cache");
Object.defineProperty(exports, "submitJob", { enumerable: true, get: function () { return correlation_cache_1.submitJob; } });
Object.defineProperty(exports, "getJobStatus", { enumerable: true, get: function () { return correlation_cache_1.getJobStatus; } });
Object.defineProperty(exports, "getCachedCorrelation", { enumerable: true, get: function () { return correlation_cache_1.getCachedCorrelation; } });
Object.defineProperty(exports, "setCachedCorrelation", { enumerable: true, get: function () { return correlation_cache_1.setCachedCorrelation; } });
Object.defineProperty(exports, "getCache", { enumerable: true, get: function () { return correlation_cache_1.getCache; } });
Object.defineProperty(exports, "setCache", { enumerable: true, get: function () { return correlation_cache_1.setCache; } });
Object.defineProperty(exports, "getCachedMatrix", { enumerable: true, get: function () { return correlation_cache_1.getCachedMatrix; } });
Object.defineProperty(exports, "cleanExpiredCache", { enumerable: true, get: function () { return correlation_cache_1.cleanExpiredCache; } });
Object.defineProperty(exports, "getJobCacheStats", { enumerable: true, get: function () { return correlation_cache_1.getCacheStats; } });
Object.defineProperty(exports, "clearAllCaches", { enumerable: true, get: function () { return correlation_cache_1.clearAllCaches; } });
// API Routes
var correlation_routes_1 = require("../api/correlation.routes");
Object.defineProperty(exports, "correlationRoutes", { enumerable: true, get: function () { return __importDefault(correlation_routes_1).default; } });
//# sourceMappingURL=index.js.map
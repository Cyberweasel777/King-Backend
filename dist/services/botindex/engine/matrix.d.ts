/**
 * BotIndex Correlation Matrix Generation
 * Creates NxN correlation matrices with clustering and anomaly detection
 */
import type { PriceSeries, CorrelationMatrix, MatrixEntry, MarketLeader } from './types';
export declare const TIME_WINDOWS: {
    readonly '1h': {
        readonly name: "1h";
        readonly hours: 1;
        readonly label: "1 Hour";
    };
    readonly '24h': {
        readonly name: "24h";
        readonly hours: 24;
        readonly label: "24 Hours";
    };
    readonly '7d': {
        readonly name: "7d";
        readonly hours: 168;
        readonly label: "7 Days";
    };
    readonly '30d': {
        readonly name: "30d";
        readonly hours: 720;
        readonly label: "30 Days";
    };
};
/**
 * Generate correlation matrix for a set of tokens
 * @param priceSeries - Array of price series for each token
 * @param window - Time window for correlation calculation
 * @returns Full correlation matrix with clusters and anomalies
 */
export declare function generateCorrelationMatrix(priceSeries: PriceSeries[], window?: keyof typeof TIME_WINDOWS): CorrelationMatrix;
/**
 * Identify market leaders based on lead/lag analysis
 * @param priceSeries - Array of price series
 * @returns Array of market leaders sorted by lead score
 */
export declare function identifyMarketLeaders(priceSeries: PriceSeries[]): MarketLeader[];
/**
 * Filter matrix by minimum correlation threshold
 * @param matrix - Full correlation matrix
 * @param threshold - Minimum absolute correlation (0-1)
 * @returns Filtered matrix entries
 */
export declare function filterByCorrelation(matrix: CorrelationMatrix, threshold?: number): MatrixEntry[];
/**
 * Get top correlated pairs from matrix
 * @param matrix - Correlation matrix
 * @param limit - Maximum number of pairs
 * @param positiveOnly - Only return positive correlations
 * @returns Top correlated pairs
 */
export declare function getTopCorrelatedPairs(matrix: CorrelationMatrix, limit?: number, positiveOnly?: boolean): MatrixEntry[];
/**
 * Calculate matrix statistics
 * @param matrix - Correlation matrix
 * @returns Statistical summary
 */
export declare function calculateMatrixStats(matrix: CorrelationMatrix): {
    avgCorrelation: number;
    maxCorrelation: {
        pair: string;
        value: number;
    };
    minCorrelation: {
        pair: string;
        value: number;
    };
    positivePairs: number;
    negativePairs: number;
    strongCorrelations: number;
    moderateCorrelations: number;
};
/**
 * Serialize matrix to compact format for storage/transmission
 * @param matrix - Correlation matrix
 * @returns Compact serialized format
 */
export declare function serializeMatrix(matrix: CorrelationMatrix): {
    tokens: string[];
    correlations: {
        i: number;
        j: number;
        c: number;
        s: number;
    }[];
    clusters: {
        id: string;
        tokens: number[];
        c: number;
    }[];
    anomalies: {
        i: number;
        j: number;
        d: number;
        s: string;
    }[];
    meta: {
        window: string;
        generatedAt: number;
    };
};
//# sourceMappingURL=matrix.d.ts.map
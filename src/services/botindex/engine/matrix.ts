/**
 * BotIndex Correlation Matrix Generation
 * Creates NxN correlation matrices with clustering and anomaly detection
 */

import { 
  calculateCorrelation, 
  detectAnomaly,
  batchCalculateCorrelations 
} from './correlation';
import type { 
  PriceSeries, 
  CorrelationMatrix, 
  TokenCluster, 
  MatrixAnomaly,
  MatrixEntry,
  MarketLeader
} from './types';

// Standard time windows
export const TIME_WINDOWS = {
  '1h': { name: '1h', hours: 1, label: '1 Hour' },
  '24h': { name: '24h', hours: 24, label: '24 Hours' },
  '7d': { name: '7d', hours: 168, label: '7 Days' },
  '30d': { name: '30d', hours: 720, label: '30 Days' }
} as const;

// Minimum data points required for correlation
const MIN_DATA_POINTS = 10;

// Correlation thresholds
const CORR_STRONG = 0.7;
const CORR_MODERATE = 0.4;

/**
 * Generate correlation matrix for a set of tokens
 * @param priceSeries - Array of price series for each token
 * @param window - Time window for correlation calculation
 * @returns Full correlation matrix with clusters and anomalies
 */
export function generateCorrelationMatrix(
  priceSeries: PriceSeries[],
  window: keyof typeof TIME_WINDOWS = '24h'
): CorrelationMatrix {
  const tokens = priceSeries.map(p => p.token);
  const n = tokens.length;

  // Initialize empty matrix
  const matrix: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));
  const significance: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));
  const entries: MatrixEntry[] = [];

  // Calculate all pairwise correlations
  const correlationMap = batchCalculateCorrelations(priceSeries, {
    minSampleSize: MIN_DATA_POINTS,
    useReturns: true
  });

  // Fill matrix from correlation results
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        matrix[i][j] = 1;
        significance[i][j] = 0;
        continue;
      }

      const key = [tokens[i], tokens[j]].sort().join('-');
      const result = correlationMap.get(key);

      if (result) {
        matrix[i][j] = result.coefficient;
        significance[i][j] = 1 - result.significance; // Convert to p-value approximation

        entries.push({
          tokenA: tokens[i],
          tokenB: tokens[j],
          correlation: result.coefficient,
          significance: result.significance,
          relationship: result.relationship,
          isAnomaly: false // Will be updated by anomaly detection
        });
      }
    }
  }

  // Detect anomalies
  const anomalies = detectMatrixAnomalies(matrix, tokens);

  // Mark anomalous entries
  for (const anomaly of anomalies) {
    const entry = entries.find(e => 
      (e.tokenA === anomaly.tokenA && e.tokenB === anomaly.tokenB) ||
      (e.tokenA === anomaly.tokenB && e.tokenB === anomaly.tokenA)
    );
    if (entry) {
      entry.isAnomaly = true;
      entry.anomalySeverity = anomaly.severity;
    }
  }

  // Detect clusters
  const clusters = detectClusters(matrix, tokens);

  return {
    tokens,
    matrix,
    significance,
    entries,
    clusters,
    anomalies,
    generatedAt: Date.now(),
    window: TIME_WINDOWS[window].name
  };
}

/**
 * Detect token clusters using hierarchical clustering approach
 * @param matrix - Correlation matrix
 * @param tokens - Token identifiers
 * @returns Array of token clusters
 */
function detectClusters(
  matrix: number[][],
  tokens: string[]
): TokenCluster[] {
  const n = tokens.length;
  if (n < 2) return [];

  // Use simple agglomerative clustering
  const clusters: TokenCluster[] = [];

  // Start with each token as its own cluster
  const currentClusters: { tokens: number[]; id: string }[] = 
    tokens.map((_, i) => ({ tokens: [i], id: `cluster-${i}` }));

  // Merge clusters based on average linkage
  while (currentClusters.length > 1) {
    let maxAvgCorr = -1;
    let mergeI = -1;
    let mergeJ = -1;

    // Find pair of clusters with highest average correlation
    for (let i = 0; i < currentClusters.length; i++) {
      for (let j = i + 1; j < currentClusters.length; j++) {
        const clusterA = currentClusters[i];
        const clusterB = currentClusters[j];

        let sumCorr = 0;
        let count = 0;

        for (const idxA of clusterA.tokens) {
          for (const idxB of clusterB.tokens) {
            sumCorr += Math.abs(matrix[idxA][idxB]);
            count++;
          }
        }

        const avgCorr = count > 0 ? sumCorr / count : 0;
        
        if (avgCorr > maxAvgCorr && avgCorr > CORR_MODERATE) {
          maxAvgCorr = avgCorr;
          mergeI = i;
          mergeJ = j;
        }
      }
    }

    // Stop if no good merge found
    if (mergeI === -1 || maxAvgCorr < CORR_MODERATE) break;

    // Merge clusters
    const mergedTokens = [
      ...currentClusters[mergeI].tokens,
      ...currentClusters[mergeJ].tokens
    ];
    
    currentClusters.splice(Math.max(mergeI, mergeJ), 1);
    currentClusters.splice(Math.min(mergeI, mergeJ), 1);
    currentClusters.push({
      tokens: mergedTokens,
      id: `cluster-${Date.now()}-${mergedTokens.length}`
    });
  }

  // Convert to final cluster format with metrics
  for (const cluster of currentClusters) {
    if (cluster.tokens.length < 2) continue;

    const clusterTokens = cluster.tokens.map(i => tokens[i]);
    
    // Calculate internal correlation (within cluster)
    let internalSum = 0;
    let internalCount = 0;
    
    // Calculate external correlation (with tokens outside cluster)
    let externalSum = 0;
    let externalCount = 0;

    for (const idxA of cluster.tokens) {
      for (let idxB = 0; idxB < n; idxB++) {
        if (cluster.tokens.includes(idxB)) {
          if (idxA < idxB) {
            internalSum += Math.abs(matrix[idxA][idxB]);
            internalCount++;
          }
        } else {
          externalSum += Math.abs(matrix[idxA][idxB]);
          externalCount++;
        }
      }
    }

    const avgInternalCorrelation = internalCount > 0 ? internalSum / internalCount : 0;
    const avgExternalCorrelation = externalCount > 0 ? externalSum / externalCount : 0;
    
    // Cohesion is how much more correlated internal vs external
    const cohesion = avgExternalCorrelation > 0 
      ? avgInternalCorrelation / avgExternalCorrelation 
      : avgInternalCorrelation;

    clusters.push({
      id: cluster.id,
      tokens: clusterTokens,
      avgInternalCorrelation,
      avgExternalCorrelation,
      cohesion: Math.min(1, cohesion),
      description: generateClusterDescription(clusterTokens, avgInternalCorrelation)
    });
  }

  // Sort by cohesion (most cohesive first)
  clusters.sort((a, b) => b.cohesion - a.cohesion);

  return clusters;
}

/**
 * Generate human-readable cluster description
 */
function generateClusterDescription(
  tokens: string[],
  avgCorrelation: number
): string {
  const size = tokens.length;
  const strength = avgCorrelation > CORR_STRONG ? 'strongly' :
                   avgCorrelation > CORR_MODERATE ? 'moderately' : 'weakly';
  
  if (size <= 3) {
    return `${tokens.join(', ')} move ${strength} together`;
  }
  
  return `Group of ${size} tokens that move ${strength} together`;
}

/**
 * Detect anomalies in correlation matrix
 * @param matrix - Current correlation matrix
 * @param tokens - Token identifiers
 * @returns Array of detected anomalies
 */
function detectMatrixAnomalies(
  matrix: number[][],
  tokens: string[]
): MatrixAnomaly[] {
  const anomalies: MatrixAnomaly[] = [];
  const n = tokens.length;

  // For each pair, check if current correlation is anomalous
  // based on historical pattern (simplified: using mean of row as baseline)
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const currentCorr = matrix[i][j];
      
      // Get historical correlations for this pair (row i and row j)
      const history: number[] = [];
      for (let k = 0; k < n; k++) {
        if (k !== i && k !== j) {
          history.push(matrix[i][k]);
          history.push(matrix[j][k]);
        }
      }

      const { isAnomaly, severity, direction, zScore } = detectAnomaly(
        currentCorr,
        history,
        2.0 // 2 standard deviations
      );

      if (isAnomaly && severity !== 'none') {
        const mean = history.reduce((a, b) => a + b, 0) / history.length;
        
        anomalies.push({
          tokenA: tokens[i],
          tokenB: tokens[j],
          currentCorrelation: currentCorr,
          expectedCorrelation: mean,
          deviation: zScore,
          severity,
          direction,
          detectedAt: Date.now()
        });
      }
    }
  }

  // Sort by severity
  const severityOrder = { high: 0, medium: 1, low: 2 };
  anomalies.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return anomalies;
}

/**
 * Identify market leaders based on lead/lag analysis
 * @param priceSeries - Array of price series
 * @returns Array of market leaders sorted by lead score
 */
export function identifyMarketLeaders(
  priceSeries: PriceSeries[]
): MarketLeader[] {
  const n = priceSeries.length;
  if (n < 2) return [];

  const leaders: MarketLeader[] = [];

  // Calculate lead/lag for each token pair
  for (let i = 0; i < n; i++) {
    const tokenA = priceSeries[i];
    let totalLeadTime = 0;
    let leadCount = 0;
    let numLedTokens = 0;
    let sumCorrelationToFollowers = 0;
    let strongCausalityCount = 0;
    let moderateCausalityCount = 0;

    for (let j = 0; j < n; j++) {
      if (i === j) continue;

      const tokenB = priceSeries[j];
      
      try {
        const result = calculateCorrelation(tokenA, tokenB);
        const leadLag = result.leadLag;

        // Token A is leading if optimal lag is negative and correlation is significant
        if (!leadLag.isASecond && leadLag.maxCorrelation > 0.4) {
          totalLeadTime += Math.abs(leadLag.optimalLag);
          leadCount++;
          sumCorrelationToFollowers += leadLag.maxCorrelation;
          numLedTokens++;

          if (leadLag.causalityStrength === 'strong') strongCausalityCount++;
          else if (leadLag.causalityStrength === 'moderate') moderateCausalityCount++;
        }
      } catch (e) {
        // Skip pairs that can't be calculated
        continue;
      }
    }

    if (numLedTokens === 0) continue;

    // Calculate lead score (0-100)
    // Based on: number of tokens led, average lead time, correlation strength, causality strength
    const avgLeadTime = leadCount > 0 ? totalLeadTime / leadCount : 0;
    const avgCorrelation = sumCorrelationToFollowers / numLedTokens;
    
    const coverageScore = (numLedTokens / (n - 1)) * 25; // Up to 25 points
    const timelinessScore = Math.min(avgLeadTime / 3, 1) * 25; // Up to 25 points
    const correlationScore = avgCorrelation * 25; // Up to 25 points
    const causalityScore = (strongCausalityCount * 15 + moderateCausalityCount * 5) / Math.max(numLedTokens, 1); // Up to 25 points
    
    const leadScore = coverageScore + timelinessScore + correlationScore + causalityScore;

    // Determine overall causality strength
    let causalityStrength: 'strong' | 'moderate' | 'weak' = 'weak';
    if (strongCausalityCount >= numLedTokens * 0.5) {
      causalityStrength = 'strong';
    } else if (strongCausalityCount + moderateCausalityCount >= numLedTokens * 0.4) {
      causalityStrength = 'moderate';
    }

    // Confidence based on sample size and consistency
    const confidence: 'high' | 'medium' | 'low' = 
      numLedTokens >= (n - 1) * 0.7 ? 'high' :
      numLedTokens >= (n - 1) * 0.4 ? 'medium' : 'low';

    leaders.push({
      token: tokenA.token,
      leadScore: Math.round(leadScore),
      avgLeadTime: Math.round(avgLeadTime * 100) / 100,
      numLedTokens,
      avgCorrelationToFollowers: Math.round(avgCorrelation * 1000) / 1000,
      causalityStrength,
      confidence
    });
  }

  // Sort by lead score (descending)
  leaders.sort((a, b) => b.leadScore - a.leadScore);

  return leaders;
}

/**
 * Filter matrix by minimum correlation threshold
 * @param matrix - Full correlation matrix
 * @param threshold - Minimum absolute correlation (0-1)
 * @returns Filtered matrix entries
 */
export function filterByCorrelation(
  matrix: CorrelationMatrix,
  threshold: number = 0.5
): MatrixEntry[] {
  return matrix.entries.filter(e => 
    Math.abs(e.correlation) >= threshold && e.tokenA !== e.tokenB
  );
}

/**
 * Get top correlated pairs from matrix
 * @param matrix - Correlation matrix
 * @param limit - Maximum number of pairs
 * @param positiveOnly - Only return positive correlations
 * @returns Top correlated pairs
 */
export function getTopCorrelatedPairs(
  matrix: CorrelationMatrix,
  limit: number = 10,
  positiveOnly: boolean = true
): MatrixEntry[] {
  let entries = matrix.entries.filter(e => e.tokenA !== e.tokenB);
  
  if (positiveOnly) {
    entries = entries.filter(e => e.correlation > 0);
  }

  // Sort by absolute correlation (descending)
  entries.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));

  return entries.slice(0, limit);
}

/**
 * Calculate matrix statistics
 * @param matrix - Correlation matrix
 * @returns Statistical summary
 */
export function calculateMatrixStats(matrix: CorrelationMatrix): {
  avgCorrelation: number;
  maxCorrelation: { pair: string; value: number };
  minCorrelation: { pair: string; value: number };
  positivePairs: number;
  negativePairs: number;
  strongCorrelations: number;
  moderateCorrelations: number;
} {
  const entries = matrix.entries.filter(e => e.tokenA !== e.tokenB);
  
  if (entries.length === 0) {
    return {
      avgCorrelation: 0,
      maxCorrelation: { pair: '', value: 0 },
      minCorrelation: { pair: '', value: 0 },
      positivePairs: 0,
      negativePairs: 0,
      strongCorrelations: 0,
      moderateCorrelations: 0
    };
  }

  let sumCorr = 0;
  let maxCorr = -1;
  let minCorr = 1;
  let maxPair = '';
  let minPair = '';
  let positiveCount = 0;
  let negativeCount = 0;
  let strongCount = 0;
  let moderateCount = 0;

  for (const entry of entries) {
    const corr = entry.correlation;
    sumCorr += corr;

    if (corr > maxCorr) {
      maxCorr = corr;
      maxPair = `${entry.tokenA}-${entry.tokenB}`;
    }

    if (corr < minCorr) {
      minCorr = corr;
      minPair = `${entry.tokenA}-${entry.tokenB}`;
    }

    if (corr > 0) positiveCount++;
    else negativeCount++;

    const absCorr = Math.abs(corr);
    if (absCorr > CORR_STRONG) strongCount++;
    else if (absCorr > CORR_MODERATE) moderateCount++;
  }

  return {
    avgCorrelation: sumCorr / entries.length,
    maxCorrelation: { pair: maxPair, value: maxCorr },
    minCorrelation: { pair: minPair, value: minCorr },
    positivePairs: positiveCount,
    negativePairs: negativeCount,
    strongCorrelations: strongCount,
    moderateCorrelations: moderateCount
  };
}

/**
 * Serialize matrix to compact format for storage/transmission
 * @param matrix - Correlation matrix
 * @returns Compact serialized format
 */
export function serializeMatrix(matrix: CorrelationMatrix): {
  tokens: string[];
  correlations: { i: number; j: number; c: number; s: number }[];
  clusters: { id: string; tokens: number[]; c: number }[];
  anomalies: { i: number; j: number; d: number; s: string }[];
  meta: { window: string; generatedAt: number };
} {
  const tokenIndex = new Map(matrix.tokens.map((t, i) => [t, i]));

  return {
    tokens: matrix.tokens,
    correlations: matrix.entries
      .filter(e => e.tokenA !== e.tokenB)
      .map(e => ({
        i: tokenIndex.get(e.tokenA)!,
        j: tokenIndex.get(e.tokenB)!,
        c: Math.round(e.correlation * 1000) / 1000, // 3 decimal places
        s: Math.round(e.significance * 100) / 100
      })),
    clusters: matrix.clusters.map(c => ({
      id: c.id,
      tokens: c.tokens.map(t => tokenIndex.get(t)!),
      c: Math.round(c.cohesion * 100) / 100
    })),
    anomalies: matrix.anomalies.map(a => ({
      i: tokenIndex.get(a.tokenA)!,
      j: tokenIndex.get(a.tokenB)!,
      d: Math.round(a.deviation * 100) / 100,
      s: a.severity[0] // 'h', 'm', 'l'
    })),
    meta: {
      window: matrix.window,
      generatedAt: matrix.generatedAt
    }
  };
}

/**
 * BotIndex Correlation Engine Types
 */

/** OHLCV data point */
export interface OHLCVPoint {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Price series for a token */
export interface PriceSeries {
  token: string;
  chain?: string;
  data: OHLCVPoint[];
  lastUpdated: number;
}

/** Correlation result for a token pair */
export interface CorrelationResult {
  tokenA: string;
  tokenB: string;
  coefficient: number;
  significance: number;
  sampleSize: number;
  relationship: 'strong_positive' | 'moderate_positive' | 'weak' | 
                'moderate_negative' | 'strong_negative' | 'leading' | 'following';
  rolling: { timestamp: number; correlation: number; significance: number }[];
  leadLag: LeadLagResult;
  calculatedAt: number;
}

/** Lead/lag analysis result */
export interface LeadLagResult {
  tokenA: string;
  tokenB: string;
  optimalLag: number;
  maxCorrelation: number;
  isASecond: boolean;
  causalityStrength: 'strong' | 'moderate' | 'weak';
  avgLeadTime: number;
  correlations: { lag: number; correlation: number; significance: number }[];
  confidence: 'high' | 'medium' | 'low';
}

/** Correlation matrix entry */
export interface MatrixEntry {
  tokenA: string;
  tokenB: string;
  correlation: number;
  significance: number;
  relationship: string;
  isAnomaly: boolean;
  anomalySeverity?: 'low' | 'medium' | 'high';
}

/** Correlation matrix */
export interface CorrelationMatrix {
  tokens: string[];
  matrix: number[][];  // NxN correlation coefficients
  significance: number[][]; // NxN p-values
  entries: MatrixEntry[];
  clusters: TokenCluster[];
  anomalies: MatrixAnomaly[];
  generatedAt: number;
  window: string;
}

/** Token cluster */
export interface TokenCluster {
  id: string;
  tokens: string[];
  avgInternalCorrelation: number;
  avgExternalCorrelation: number;
  cohesion: number; // 0-1, how tightly correlated cluster members are
  description: string;
}

/** Matrix anomaly */
export interface MatrixAnomaly {
  tokenA: string;
  tokenB: string;
  currentCorrelation: number;
  expectedCorrelation: number;
  deviation: number;
  severity: 'low' | 'medium' | 'high';
  direction: 'increasing' | 'decreasing' | 'stable';
  detectedAt: number;
}

/** Market leader result */
export interface MarketLeader {
  token: string;
  leadScore: number;
  avgLeadTime: number; // hours
  numLedTokens: number;
  avgCorrelationToFollowers: number;
  causalityStrength: 'strong' | 'moderate' | 'weak';
  confidence: 'high' | 'medium' | 'low';
}

/** Cached correlation result */
export interface CachedCorrelation {
  key: string;
  result: CorrelationResult;
  cachedAt: number;
  expiresAt: number;
}

/** Time window configuration */
export interface TimeWindow {
  name: string;
  hours: number;
  label: string;
}

/** Price data source */
export interface PriceDataSource {
  name: 'dexscreener' | 'geckoterminal' | 'fallback';
  weight: number;
  reliability: number;
}

/** Calculation job */
export interface CalculationJob {
  id: string;
  type: 'full_matrix' | 'pair_correlation' | 'leadership_analysis';
  status: 'pending' | 'running' | 'completed' | 'failed';
  params: Record<string, any>;
  result?: any;
  error?: string;
  startedAt?: number;
  completedAt?: number;
  priority: number;
}

/** API response types */
export interface CorrelationPairResponse {
  tokenA: string;
  tokenB: string;
  correlation: number;
  significance: number;
  relationship: string;
  sampleSize: number;
  leadLag: {
    optimalLag: number;
    maxCorrelation: number;
    isLeading: boolean;
    causalityStrength: string;
    avgLeadTime: number;
  };
  rolling: {
    window: string;
    data: { timestamp: number; correlation: number }[];
  }[];
  calculatedAt: string;
}

export interface CorrelationMatrixResponse {
  tokens: string[];
  matrix: number[][];
  clusters: {
    id: string;
    tokens: string[];
    avgCorrelation: number;
    cohesion: number;
  }[];
  anomalies: {
    pair: string;
    current: number;
    expected: number;
    severity: string;
  }[];
  window: string;
  generatedAt: string;
}

export interface MarketLeadersResponse {
  leaders: {
    token: string;
    leadScore: number;
    avgLeadTime: number;
    numLedTokens: number;
    causalityStrength: string;
  }[];
  calculatedAt: string;
}

export interface CalculationTriggerResponse {
  jobId: string;
  status: string;
  message: string;
  estimatedCompletion: string;
}

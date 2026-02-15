/** ArbWatch DeepSeek Stats - Types */

/** Implied probability calculation from odds */
export interface ImpliedProbabilityInput {
  odds: number;           // Decimal odds (e.g., 2.10)
  oddsType: 'decimal' | 'american' | 'fractional';
  market?: string;        // Market identifier
  timestamp?: number;     // Unix timestamp
}

export interface ImpliedProbabilityResult {
  impliedProbability: number;      // 0-1 range
  overround: number;               // Bookmaker margin
  trueProbability?: number;        // Fair probability (adjusted for margin)
  confidence: number;              // 0-1, confidence in calculation
}

/** Kelly criterion position sizing */
export interface KellyCriterionInput {
  bankroll: number;
  winProbability: number;          // 0-1
  odds: number;                    // Decimal odds
  kellyFraction?: number;          // Fractional Kelly (default 0.25)
}

export interface KellyCriterionResult {
  optimalStake: number;            // Recommended stake amount
  stakePercentage: number;         // As % of bankroll
  edge: number;                    // Expected edge %
  expectedGrowth: number;          // Expected log growth
  halfKellyStake?: number;         // Conservative option
}

/** Expected value calculation for arbitrage */
export interface ArbitrageEVInput {
  stake: number;
  oddsA: number;                   // Bookmaker A odds
  oddsB: number;                   // Bookmaker B odds (opposite side)
  probabilityA?: number;           // Estimated true probability
}

export interface ArbitrageEVResult {
  expectedValue: number;           // Absolute EV
  evPercentage: number;            // EV as % of stake
  roi: number;                     // Expected ROI %
  variance: number;                // Variance of outcome
  sharpeRatio: number;             // Risk-adjusted return
}

/** Arbitrage opportunity analysis */
export interface ArbitrageOpportunityInput {
  market: string;
  oddsA: number;
  oddsB: number;
  bookmakerA: string;
  bookmakerB: string;
  availableLiquidityA?: number;
  availableLiquidityB?: number;
}

export interface ArbitrageOpportunityResult {
  isArbitrage: boolean;            // Whether arb exists (>0% profit)
  profitPercentage: number;        // Guaranteed profit %
  optimalStakeA: number;           // Stake on side A
  optimalStakeB: number;           // Stake on side B
  totalInvestment: number;
  guaranteedReturn: number;
  riskFactors: string[];           // Any detected risks
  arbQuality: 'poor' | 'fair' | 'good' | 'excellent';
}

/** Historical arb decay analysis */
export interface ArbDecayInput {
  historicalProfits: number[];     // Past arb profits %
  timestamps: number[];            // When they occurred
  marketCategory: string;
}

export interface ArbDecayResult {
  halfLife: number;                // Time for profit to halve (hours)
  decayRate: number;               // Profit decay per hour
  trend: 'improving' | 'stable' | 'decaying';
  seasonalityDetected: boolean;
  predictedProfit24h: number;      // Predicted arb profit in 24h
}

/** Main analysis request types */
export type AnalysisType = 
  | 'impliedProbability'
  | 'kellyCriterion'
  | 'arbitrageEV'
  | 'arbitrageOpportunity'
  | 'arbDecay';

export interface StatsRequest<T> {
  type: AnalysisType;
  data: T;
  useCache?: boolean;
  deepAnalysis?: boolean;          // Use deepseek-reasoner
}

export interface StatsResponse<T> {
  success: boolean;
  result?: T;
  error?: string;
  fromCache?: boolean;
  processingTimeMs?: number;
  modelUsed?: string;
}

/** Validation utilities */
export const VALIDATION_RANGES = {
  probability: { min: 0, max: 1 },
  odds: { min: 1.001, max: 1000 },
  percentage: { min: -1000, max: 1000 },
  stake: { min: 0, max: 1e9 },
} as const;

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function clampProbability(p: number): number {
  return clamp(p, VALIDATION_RANGES.probability.min, VALIDATION_RANGES.probability.max);
}

export function clampOdds(o: number): number {
  return clamp(o, VALIDATION_RANGES.odds.min, VALIDATION_RANGES.odds.max);
}

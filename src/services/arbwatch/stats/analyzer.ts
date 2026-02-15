/** ArbWatch DeepSeek Stats - Analyzer */

import {
  ImpliedProbabilityInput,
  ImpliedProbabilityResult,
  KellyCriterionInput,
  KellyCriterionResult,
  ArbitrageEVInput,
  ArbitrageEVResult,
  ArbitrageOpportunityInput,
  ArbitrageOpportunityResult,
  ArbDecayInput,
  ArbDecayResult,
  clampProbability,
  clampOdds,
  clamp,
} from './types';
import { callDeepSeek, checkApiHealth } from './deepseek-client';
import { statsCache } from './cache';

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

/** Local fallback: Calculate implied probability */
function localImpliedProbability(input: ImpliedProbabilityInput): ImpliedProbabilityResult {
  const odds = clampOdds(input.odds);
  const implied = 1 / odds;
  // Assume typical overround of 5%
  const overround = 0.05;
  const trueProb = implied / (1 + overround);

  return {
    impliedProbability: clampProbability(implied),
    overround: clampProbability(overround),
    trueProbability: clampProbability(trueProb),
    confidence: 0.7, // Lower confidence for local calc
  };
}

/** Local fallback: Kelly criterion */
function localKellyCriterion(input: KellyCriterionInput): KellyCriterionResult {
  const bankroll = Math.max(0, input.bankroll);
  const p = clampProbability(input.winProbability);
  const odds = clampOdds(input.odds);
  const kellyFraction = clamp(input.kellyFraction || 0.25, 0.01, 1);

  const b = odds - 1; // Decimal odds to fraction
  const q = 1 - p;
  const edge = (p * odds) - 1;

  let fullKellyPct = 0;
  if (edge > 0 && b > 0) {
    fullKellyPct = (b * p - q) / b;
  }

  const stakePct = Math.max(0, fullKellyPct * kellyFraction);
  const optimalStake = bankroll * stakePct;

  // Expected log growth: p*ln(1+b*f) + q*ln(1-f)
  const expectedGrowth = p * Math.log(1 + b * stakePct) + q * Math.log(1 - stakePct);

  return {
    optimalStake: clamp(optimalStake, 0, bankroll * 0.5),
    stakePercentage: clamp(stakePct * 100, 0, 100),
    edge: edge * 100,
    expectedGrowth: isFinite(expectedGrowth) ? expectedGrowth : 0,
    halfKellyStake: clamp(optimalStake * 0.5, 0, bankroll * 0.25),
  };
}

/** Local fallback: Arbitrage EV */
function localArbitrageEV(input: ArbitrageEVInput): ArbitrageEVResult {
  const stake = Math.max(0, input.stake);
  const oddsA = clampOdds(input.oddsA);
  const oddsB = clampOdds(input.oddsB);

  // If no probability given, assume 50/50
  const pA = input.probabilityA ? clampProbability(input.probabilityA) : 0.5;
  const pB = 1 - pA;

  // Win amount on A, lose stake on B
  const winAmountA = stake * (oddsA - 1);
  const evA = pA * winAmountA - pB * stake;

  // Win amount on B, lose stake on A (for the hedge)
  const hedgeStake = stake * (oddsA / oddsB);
  const winAmountB = hedgeStake * (oddsB - 1);
  const evB = pB * winAmountB - pA * hedgeStake;

  const totalEV = evA + evB;
  const totalStake = stake + hedgeStake;

  // Variance calculation
  const outcomes = [
    { prob: pA * pB, value: winAmountA - stake }, // Win A, Lose B
    { prob: pA * pB, value: winAmountB - hedgeStake }, // Lose A, Win B
  ];
  const mean = totalEV;
  const variance = outcomes.reduce((sum, o) => sum + o.prob * Math.pow(o.value - mean, 2), 0);
  const stdDev = Math.sqrt(Math.max(0, variance));

  return {
    expectedValue: totalEV,
    evPercentage: totalStake > 0 ? (totalEV / totalStake) * 100 : 0,
    roi: totalStake > 0 ? (totalEV / totalStake) * 100 : 0,
    variance: Math.max(0, variance),
    sharpeRatio: stdDev > 0 ? mean / stdDev : 0,
  };
}

/** Local fallback: Arbitrage opportunity */
function localArbitrageOpportunity(input: ArbitrageOpportunityInput): ArbitrageOpportunityResult {
  const oddsA = clampOdds(input.oddsA);
  const oddsB = clampOdds(input.oddsB);

  const impliedA = 1 / oddsA;
  const impliedB = 1 / oddsB;
  const totalImplied = impliedA + impliedB;

  const profitPct = Math.max(0, (1 - totalImplied) * 100);
  const isArbitrage = totalImplied < 0.99; // Allow small margin

  // Assume $1000 total investment for stake calculation
  const totalInvestment = 1000;
  const optimalStakeA = totalInvestment * impliedA / totalImplied;
  const optimalStakeB = totalInvestment * impliedB / totalImplied;

  const riskFactors: string[] = [];
  if (input.availableLiquidityA && input.availableLiquidityA < optimalStakeA) {
    riskFactors.push('Insufficient liquidity on bookmaker A');
  }
  if (input.availableLiquidityB && input.availableLiquidityB < optimalStakeB) {
    riskFactors.push('Insufficient liquidity on bookmaker B');
  }
  if (profitPct < 1) {
    riskFactors.push('Low profit margin');
  }

  let arbQuality: 'poor' | 'fair' | 'good' | 'excellent' = 'poor';
  if (profitPct > 5) arbQuality = 'excellent';
  else if (profitPct > 2) arbQuality = 'good';
  else if (profitPct > 1) arbQuality = 'fair';

  return {
    isArbitrage,
    profitPercentage: profitPct,
    optimalStakeA,
    optimalStakeB,
    totalInvestment,
    guaranteedReturn: totalInvestment * (profitPct / 100),
    riskFactors,
    arbQuality,
  };
}

/** Local fallback: Arb decay */
function localArbDecay(input: ArbDecayInput): ArbDecayResult {
  const profits = input.historicalProfits.filter(p => !isNaN(p));
  if (profits.length < 2) {
    return {
      halfLife: 24,
      decayRate: 0.03,
      trend: 'stable',
      seasonalityDetected: false,
      predictedProfit24h: profits[0] || 0,
    };
  }

  // Simple trend analysis
  const firstHalf = profits.slice(0, Math.floor(profits.length / 2));
  const secondHalf = profits.slice(Math.floor(profits.length / 2));
  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

  let trend: 'improving' | 'stable' | 'decaying' = 'stable';
  if (secondAvg > firstAvg * 1.1) trend = 'improving';
  else if (secondAvg < firstAvg * 0.9) trend = 'decaying';

  // Estimate decay rate from trend
  const hoursSpan = (input.timestamps[profits.length - 1] - input.timestamps[0]) / 3600000;
  const decayRate = hoursSpan > 0 ? Math.abs(Math.log(secondAvg / firstAvg)) / hoursSpan : 0.03;
  const halfLife = decayRate > 0.001 ? Math.log(2) / decayRate : 48;

  return {
    halfLife: clamp(halfLife, 0.5, 168),
    decayRate: clamp(decayRate, 0, 1),
    trend,
    seasonalityDetected: profits.length > 100 && hoursSpan > 720,
    predictedProfit24h: clamp(profits[profits.length - 1] || 0, -50, 50),
  };
}

/** Main analyzer functions */
export const analyzer = {
  /** Calculate implied probability from odds */
  async calculateImpliedProbability(
    input: ImpliedProbabilityInput,
    options: { useCache?: boolean; deepAnalysis?: boolean } = {}
  ): Promise<ImpliedProbabilityResult> {
    const cacheKey = 'impliedProbability';
    if (options.useCache !== false) {
      const cached = statsCache.get<ImpliedProbabilityResult>(cacheKey, input);
      if (cached) return cached;
    }

    const isHealthy = await checkApiHealth();
    if (!isHealthy) {
      const result = localImpliedProbability(input);
      return result;
    }

    const { result, error } = await callDeepSeek<ImpliedProbabilityResult>(
      'impliedProbability',
      JSON.stringify(input),
      { deepAnalysis: options.deepAnalysis }
    );

    if (result && !error) {
      // Validate and clamp
      const validated: ImpliedProbabilityResult = {
        impliedProbability: clampProbability(result.impliedProbability),
        overround: clampProbability(result.overround),
        trueProbability: clampProbability(result.trueProbability ?? result.impliedProbability),
        confidence: clampProbability(result.confidence),
      };
      statsCache.set(cacheKey, input, validated);
      return validated;
    }

    return localImpliedProbability(input);
  },

  /** Calculate Kelly criterion position sizing */
  async calculateKellyCriterion(
    input: KellyCriterionInput,
    options: { useCache?: boolean; deepAnalysis?: boolean } = {}
  ): Promise<KellyCriterionResult> {
    const cacheKey = 'kellyCriterion';
    if (options.useCache !== false) {
      const cached = statsCache.get<KellyCriterionResult>(cacheKey, input);
      if (cached) return cached;
    }

    const isHealthy = await checkApiHealth();
    if (!isHealthy) {
      return localKellyCriterion(input);
    }

    const { result, error } = await callDeepSeek<KellyCriterionResult>(
      'kellyCriterion',
      JSON.stringify(input),
      { deepAnalysis: options.deepAnalysis }
    );

    if (result && !error) {
      const validated: KellyCriterionResult = {
        optimalStake: clamp(result.optimalStake, 0, 1e9),
        stakePercentage: clamp(result.stakePercentage, 0, 100),
        edge: clamp(result.edge, -1000, 1000),
        expectedGrowth: clamp(result.expectedGrowth, -10, 10),
        halfKellyStake: clamp(result.halfKellyStake ?? result.optimalStake * 0.5, 0, 1e9),
      };
      statsCache.set(cacheKey, input, validated);
      return validated;
    }

    return localKellyCriterion(input);
  },

  /** Calculate arbitrage EV */
  async calculateArbitrageEV(
    input: ArbitrageEVInput,
    options: { useCache?: boolean; deepAnalysis?: boolean } = {}
  ): Promise<ArbitrageEVResult> {
    const cacheKey = 'arbitrageEV';
    if (options.useCache !== false) {
      const cached = statsCache.get<ArbitrageEVResult>(cacheKey, input);
      if (cached) return cached;
    }

    const isHealthy = await checkApiHealth();
    if (!isHealthy) {
      return localArbitrageEV(input);
    }

    const { result, error } = await callDeepSeek<ArbitrageEVResult>(
      'arbitrageEV',
      JSON.stringify(input),
      { deepAnalysis: options.deepAnalysis }
    );

    if (result && !error) {
      const validated: ArbitrageEVResult = {
        expectedValue: result.expectedValue,
        evPercentage: clamp(result.evPercentage, -1000, 1000),
        roi: clamp(result.roi, -100, 1000),
        variance: Math.max(0, result.variance),
        sharpeRatio: clamp(result.sharpeRatio, -100, 100),
      };
      statsCache.set(cacheKey, input, validated);
      return validated;
    }

    return localArbitrageEV(input);
  },

  /** Analyze arbitrage opportunity */
  async analyzeArbitrageOpportunity(
    input: ArbitrageOpportunityInput,
    options: { useCache?: boolean; deepAnalysis?: boolean } = {}
  ): Promise<ArbitrageOpportunityResult> {
    const cacheKey = 'arbitrageOpportunity';
    if (options.useCache !== false) {
      const cached = statsCache.get<ArbitrageOpportunityResult>(cacheKey, input);
      if (cached) return cached;
    }

    const isHealthy = await checkApiHealth();
    if (!isHealthy) {
      return localArbitrageOpportunity(input);
    }

    const { result, error } = await callDeepSeek<ArbitrageOpportunityResult>(
      'arbitrageOpportunity',
      JSON.stringify(input),
      { deepAnalysis: options.deepAnalysis }
    );

    if (result && !error) {
      const validated: ArbitrageOpportunityResult = {
        isArbitrage: Boolean(result.isArbitrage),
        profitPercentage: clamp(result.profitPercentage, -10, 50),
        optimalStakeA: clamp(result.optimalStakeA, 0, 1e9),
        optimalStakeB: clamp(result.optimalStakeB, 0, 1e9),
        totalInvestment: clamp(result.totalInvestment, 0, 1e9),
        guaranteedReturn: result.guaranteedReturn,
        riskFactors: Array.isArray(result.riskFactors) ? result.riskFactors : [],
        arbQuality: ['poor', 'fair', 'good', 'excellent'].includes(result.arbQuality)
          ? result.arbQuality
          : 'poor',
      };
      statsCache.set(cacheKey, input, validated);
      return validated;
    }

    return localArbitrageOpportunity(input);
  },

  /** Analyze arb decay pattern */
  async analyzeArbDecay(
    input: ArbDecayInput,
    options: { useCache?: boolean; deepAnalysis?: boolean } = {}
  ): Promise<ArbDecayResult> {
    const cacheKey = 'arbDecay';
    if (options.useCache !== false) {
      const cached = statsCache.get<ArbDecayResult>(cacheKey, input);
      if (cached) return cached;
    }

    const isHealthy = await checkApiHealth();
    if (!isHealthy) {
      return localArbDecay(input);
    }

    const { result, error } = await callDeepSeek<ArbDecayResult>(
      'arbDecay',
      JSON.stringify(input),
      { deepAnalysis: options.deepAnalysis || true } // Always use deep for time series
    );

    if (result && !error) {
      const validated: ArbDecayResult = {
        halfLife: clamp(result.halfLife, 0.1, 720),
        decayRate: clamp(result.decayRate, -1, 1),
        trend: ['improving', 'stable', 'decaying'].includes(result.trend)
          ? result.trend
          : 'stable',
        seasonalityDetected: Boolean(result.seasonalityDetected),
        predictedProfit24h: clamp(result.predictedProfit24h, -50, 50),
      };
      statsCache.set(cacheKey, input, validated);
      return validated;
    }

    return localArbDecay(input);
  },
};

export { localImpliedProbability, localKellyCriterion, localArbitrageEV, localArbitrageOpportunity, localArbDecay };

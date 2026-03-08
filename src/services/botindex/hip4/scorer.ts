import { HIP4OutcomeMarket, HIP4Position, HIP4ScoreCard, HIP4SettlementSource, HIP4SettlementType } from './types';

const WEIGHTS = {
  marketLiquidity: 0.25,
  settlementClarity: 0.25,
  participationBalance: 0.2,
  timeToExpiry: 0.15,
  priceEfficiency: 0.15,
} as const;

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function toEpochMs(timestamp: number): number {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return 0;
  }

  return timestamp > 10_000_000_000 ? timestamp : timestamp * 1000;
}

function toTier(score: number): HIP4ScoreCard['tier'] {
  if (score >= 80) return 'A';
  if (score >= 65) return 'B';
  if (score >= 50) return 'C';
  return 'D';
}

function scoreMarketLiquidity(market: HIP4OutcomeMarket): number {
  const openInterest = Math.max(0, market.openInterest);
  const totalVolume = Math.max(0, market.totalVolume);
  if (totalVolume <= 0) {
    return 0;
  }

  const ratio = openInterest / totalVolume;
  const bounded = clamp(ratio, 0.1, 2.0);
  return clamp((bounded - 0.1) / 1.9);
}

function scoreSettlementClarity(settlement?: HIP4SettlementSource): number {
  if (!settlement) {
    return 0.3;
  }

  const reliability = clamp(settlement.reliability);
  let score = reliability > 0.8 ? 1 : reliability;

  if (settlement.type === HIP4SettlementType.MANUAL) {
    score = Math.min(score, 0.7);
  } else if (settlement.type === HIP4SettlementType.ONCHAIN) {
    score = Math.max(score, 0.8);
  }

  return clamp(score);
}

function scoreParticipationBalance(market: HIP4OutcomeMarket): number {
  const yesPrice = clamp(market.yesPrice, 0, 1);
  if (yesPrice <= 0.05 || yesPrice >= 0.95) {
    return 0.1;
  }

  const distanceFromMid = Math.abs(yesPrice - 0.5);
  return clamp(1 - distanceFromMid / 0.5);
}

function scoreTimeToExpiry(market: HIP4OutcomeMarket): number {
  const expiryMs = toEpochMs(market.expiryAt);
  if (expiryMs <= 0) {
    return 0;
  }

  const msUntilExpiry = expiryMs - Date.now();
  const daysUntilExpiry = msUntilExpiry / (24 * 60 * 60 * 1000);

  if (!Number.isFinite(daysUntilExpiry) || daysUntilExpiry <= 0) {
    return 0;
  }

  if (daysUntilExpiry < 1) {
    return 0.3;
  }

  if (daysUntilExpiry < 2) {
    return 0.3 + 0.7 * (daysUntilExpiry - 1);
  }

  if (daysUntilExpiry <= 30) {
    return 1;
  }

  if (daysUntilExpiry <= 90) {
    return 1 - ((daysUntilExpiry - 30) / 60) * 0.5;
  }

  return 0.5;
}

function scorePriceEfficiency(market: HIP4OutcomeMarket): number {
  const yes = clamp(market.yesPrice, 0, 1);
  const no = clamp(market.noPrice, 0, 1);
  const deviation = Math.abs(yes + no - 1);
  return clamp(1 - deviation / 0.25);
}

export function scoreMarket(
  market: HIP4OutcomeMarket,
  _positions: HIP4Position[],
  settlement?: HIP4SettlementSource
): HIP4ScoreCard {
  const factors = {
    marketLiquidity: round(scoreMarketLiquidity(market)),
    settlementClarity: round(scoreSettlementClarity(settlement)),
    participationBalance: round(scoreParticipationBalance(market)),
    timeToExpiry: round(scoreTimeToExpiry(market)),
    priceEfficiency: round(scorePriceEfficiency(market)),
  };

  const weightedScore =
    factors.marketLiquidity * WEIGHTS.marketLiquidity +
    factors.settlementClarity * WEIGHTS.settlementClarity +
    factors.participationBalance * WEIGHTS.participationBalance +
    factors.timeToExpiry * WEIGHTS.timeToExpiry +
    factors.priceEfficiency * WEIGHTS.priceEfficiency;

  const score = Math.round(clamp(weightedScore) * 100);

  return {
    marketId: market.marketId,
    score,
    tier: toTier(score),
    factors,
  };
}

export function formatScoreCard(score: HIP4ScoreCard): {
  marketId: string;
  score: number;
  tier: HIP4ScoreCard['tier'];
  factors: HIP4ScoreCard['factors'];
} {
  return {
    marketId: score.marketId,
    score: score.score,
    tier: score.tier,
    factors: score.factors,
  };
}

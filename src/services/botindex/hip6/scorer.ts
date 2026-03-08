import { HIP6AuctionState, HIP6Bid, HIP6ClearingEvent, HIP6ScoreCard, ScoreTier } from './types';

const WEIGHTS = {
  bidConcentration: 0.25,
  priceStability: 0.2,
  volumeVelocity: 0.2,
  participantDiversity: 0.2,
  liquiditySeedRatio: 0.15,
} as const;

type AuctionStateWithSeed = HIP6AuctionState & {
  seedPercent?: number;
  liquiditySeedPercent?: number | { min?: number; max?: number };
};

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function toTier(score: number): ScoreTier {
  if (score >= 80) return 'A';
  if (score >= 65) return 'B';
  if (score >= 50) return 'C';
  return 'D';
}

function normalizePercent(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value <= 1) return clamp(value);
  if (value <= 100) return clamp(value / 100);
  if (value <= 10_000) return clamp(value / 10_000);
  return 1;
}

function scoreBidConcentration(bids: HIP6Bid[]): number {
  if (bids.length === 0) return 0;

  const budgets = bids.map((bid) => Math.max(0, bid.budget));
  const totalBudget = budgets.reduce((acc, budget) => acc + budget, 0);
  if (totalBudget <= 0) return 0;

  const herfindahl = budgets.reduce((acc, budget) => {
    const share = budget / totalBudget;
    return acc + share * share;
  }, 0);

  return clamp(1 - herfindahl);
}

function scorePriceStability(clearingEvents: HIP6ClearingEvent[]): number {
  if (clearingEvents.length < 2) return 0;

  const prices = clearingEvents
    .map((event) => event.clearingPrice)
    .filter((price) => Number.isFinite(price) && price > 0);

  if (prices.length < 2) return 0;

  const mean = prices.reduce((acc, price) => acc + price, 0) / prices.length;
  if (mean <= 0) return 0;

  const variance = prices.reduce((acc, price) => {
    const delta = price - mean;
    return acc + delta * delta;
  }, 0) / prices.length;

  const stdDev = Math.sqrt(variance);
  const coefficientOfVariation = stdDev / mean;

  return clamp(1 - coefficientOfVariation / 0.5);
}

function scoreVolumeVelocity(state: HIP6AuctionState, clearingEvents: HIP6ClearingEvent[]): number {
  const derivedVolume = clearingEvents.reduce((acc, event) => acc + Math.max(0, event.volumeCleared), 0);
  const totalVolume = Math.max(0, state.totalVolume || derivedVolume);
  const ageBlocks = Math.max(1, state.currentBlock);
  const velocity = totalVolume / ageBlocks;

  return clamp(Math.log10(1 + velocity) / 2);
}

function scoreParticipantDiversity(bids: HIP6Bid[]): number {
  if (bids.length === 0) return 0;

  const uniqueBidders = new Set(
    bids
      .map((bid) => bid.bidder.trim().toLowerCase())
      .filter((bidder) => bidder.length > 0)
  );

  return clamp(uniqueBidders.size / bids.length);
}

function scoreLiquiditySeedRatio(state: HIP6AuctionState): number {
  const stateWithSeed = state as AuctionStateWithSeed;

  if (typeof stateWithSeed.seedPercent === 'number') {
    return normalizePercent(stateWithSeed.seedPercent);
  }

  if (typeof stateWithSeed.liquiditySeedPercent === 'number') {
    return normalizePercent(stateWithSeed.liquiditySeedPercent);
  }

  if (stateWithSeed.liquiditySeedPercent && typeof stateWithSeed.liquiditySeedPercent === 'object') {
    const min = stateWithSeed.liquiditySeedPercent.min;
    const max = stateWithSeed.liquiditySeedPercent.max;
    const values = [min, max].filter((value): value is number => Number.isFinite(value));

    if (values.length > 0) {
      const midpoint = values.reduce((acc, value) => acc + value, 0) / values.length;
      return normalizePercent(midpoint);
    }
  }

  return normalizePercent(state.seedPrice);
}

export function scoreAuction(
  state: HIP6AuctionState,
  bids: HIP6Bid[],
  clearingEvents: HIP6ClearingEvent[]
): HIP6ScoreCard {
  const factors = {
    bidConcentration: round(scoreBidConcentration(bids)),
    priceStability: round(scorePriceStability(clearingEvents)),
    volumeVelocity: round(scoreVolumeVelocity(state, clearingEvents)),
    participantDiversity: round(scoreParticipantDiversity(bids)),
    liquiditySeedRatio: round(scoreLiquiditySeedRatio(state)),
  };

  const weightedScore =
    factors.bidConcentration * WEIGHTS.bidConcentration +
    factors.priceStability * WEIGHTS.priceStability +
    factors.volumeVelocity * WEIGHTS.volumeVelocity +
    factors.participantDiversity * WEIGHTS.participantDiversity +
    factors.liquiditySeedRatio * WEIGHTS.liquiditySeedRatio;

  const score = Math.round(clamp(weightedScore, 0, 1) * 100);

  return {
    auctionId: state.auctionId,
    score,
    tier: toTier(score),
    factors,
  };
}

export function formatScoreCard(score: HIP6ScoreCard): {
  auctionId: string;
  score: number;
  tier: ScoreTier;
  factors: HIP6ScoreCard['factors'];
} {
  return {
    auctionId: score.auctionId,
    score: score.score,
    tier: score.tier,
    factors: score.factors,
  };
}

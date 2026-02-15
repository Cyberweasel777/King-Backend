/**
 * Arbitrage Engine
 * Detects arbitrage opportunities across prediction markets
 * Reuses pattern from SpreadHunter/SkinSignal
 */

import {
  ArbitrageOpportunity, PredictionEvent, Market, OddsSnapshot,
  PredictionMarket, ArbitrageCalculation, CrossMarketMatch
} from '../types';
import { analyzer } from '../stats';

// Default minimum profit thresholds
const DEFAULT_MIN_PROFIT_PERCENT = 1; // 1% for prediction markets (tighter than skins)
const MIN_LIQUIDITY_THRESHOLD = 1000; // $1000 minimum liquidity

/**
 * Match events/questions across markets
 */
export function matchMarketsAcrossPlatforms(
  events: Record<PredictionMarket, PredictionEvent[]>,
  markets: Record<PredictionMarket, Market[]>
): CrossMarketMatch[] {
  const matches: CrossMarketMatch[] = [];
  const marketList = Object.values(markets).flat();

  // Group by normalized question text
  const byQuestion: Record<string, Market[]> = {};
  
  for (const market of marketList) {
    const normalized = normalizeQuestion(market.question);
    if (!byQuestion[normalized]) {
      byQuestion[normalized] = [];
    }
    byQuestion[normalized].push(market);
  }

  // Find matches with multiple markets
  for (const [question, marketGroup] of Object.entries(byQuestion)) {
    if (marketGroup.length < 2) continue;

    // Group by event
    const byEvent: Record<string, Market[]> = {};
    for (const m of marketGroup) {
      if (!byEvent[m.eventId]) byEvent[m.eventId] = [];
      byEvent[m.eventId].push(m);
    }

    for (const [eventId, eventMarkets] of Object.entries(byEvent)) {
      if (eventMarkets.length < 2) continue;

      const event = findEvent(events, eventId);
      if (!event) continue;

      const matchedOutcomes = findCommonOutcomes(eventMarkets);
      
      matches.push({
        eventId,
        eventTitle: event.title,
        question,
        markets: eventMarkets.map(m => ({
          market: m.market,
          marketId: m.id,
          outcomes: m.outcomePrices,
        })),
        matchedOutcomes,
      });
    }
  }

  return matches;
}

/**
 * Detect arbitrage opportunities across matched markets
 */
export function detectArbitrage(
  matches: CrossMarketMatch[],
  minProfitPercent: number = DEFAULT_MIN_PROFIT_PERCENT
): ArbitrageOpportunity[] {
  const opportunities: ArbitrageOpportunity[] = [];

  for (const match of matches) {
    for (const outcome of match.matchedOutcomes) {
      const arb = checkArbitrageForOutcome(match, outcome, minProfitPercent);
      if (arb) {
        opportunities.push(arb);
      }
    }
  }

  return opportunities.sort((a, b) => b.profitPercent - a.profitPercent);
}

/**
 * Enhanced arbitrage detection with DeepSeek probability analysis
 */
export async function detectArbitrageWithStats(
  matches: CrossMarketMatch[],
  minProfitPercent: number = DEFAULT_MIN_PROFIT_PERCENT
): Promise<ArbitrageOpportunity[]> {
  const opportunities: ArbitrageOpportunity[] = [];

  for (const match of matches) {
    for (const outcome of match.matchedOutcomes) {
      // Get basic arbitrage check
      const arb = checkArbitrageForOutcome(match, outcome, minProfitPercent);
      if (!arb) continue;

      // Enhance with DeepSeek analysis
      try {
        const arbInput = {
          market: match.eventId,
          oddsA: arb.longPrice > 0 ? 1 / arb.longPrice : 2.0,
          oddsB: arb.shortPrice > 0 ? 1 / arb.shortPrice : 2.0,
          bookmakerA: arb.longMarket,
          bookmakerB: arb.shortMarket,
          availableLiquidityA: arb.volumeConstraint,
          availableLiquidityB: arb.volumeConstraint,
        };

        const statsResult = await analyzer.analyzeArbitrageOpportunity(arbInput, { useCache: true });

        // Merge stats results into opportunity
        const enhancedArb: ArbitrageOpportunity = {
          ...arb,
          profitPercent: Math.max(arb.profitPercent, statsResult.profitPercentage),
          arbQuality: statsResult.arbQuality,
          riskFactors: statsResult.riskFactors,
          statsAnalyzed: true,
        };

        opportunities.push(enhancedArb);
      } catch (error) {
        // If stats fail, use basic arbitrage
        opportunities.push(arb);
      }
    }
  }

  return opportunities.sort((a, b) => b.profitPercent - a.profitPercent);
}

/**
 * Check for arbitrage on a specific outcome across markets
 * Strategy: Buy "Yes" low on one market, Buy "No" low on another (equivalent to selling Yes high)
 */
function checkArbitrageForOutcome(
  match: CrossMarketMatch,
  outcome: string,
  minProfitPercent: number
): ArbitrageOpportunity | null {
  const prices: { market: PredictionMarket; marketId: string; yesPrice: number; noPrice: number; liquidity: number }[] = [];

  for (const m of match.markets) {
    const yesPrice = m.outcomes[outcome];
    if (yesPrice === undefined) continue;
    
    const noPrice = m.outcomes[getComplementaryOutcome(m.outcomes, outcome)] || (1 - yesPrice);
    
    prices.push({
      market: m.market,
      marketId: m.marketId,
      yesPrice,
      noPrice,
      liquidity: 0, // Would need to look up actual liquidity
    });
  }

  if (prices.length < 2) return null;

  // Find best arbitrage: buy Yes at lowest price, buy No at lowest price
  let bestLong = prices[0]; // Best place to buy "Yes"
  let bestShort = prices[0]; // Best place to buy "No" (equivalent to selling "Yes")

  for (const p of prices) {
    if (p.yesPrice < bestLong.yesPrice) bestLong = p;
    if (p.noPrice < bestShort.noPrice) bestShort = p;
  }

  // Must be different markets for arbitrage
  if (bestLong.market === bestShort.market) {
    // Try to find alternative short market
    const altShort = prices.find(p => p.market !== bestLong.market && p.noPrice < 1);
    if (altShort) bestShort = altShort;
    else return null;
  }

  // Calculate arbitrage
  // Buy Yes at bestLong.yesPrice, Buy No at bestShort.noPrice
  // Total cost = bestLong.yesPrice + bestShort.noPrice
  // If cost < 1, we have arbitrage
  const totalCost = bestLong.yesPrice + bestShort.noPrice;
  
  if (totalCost >= 1) return null; // No arbitrage

  const profitAmount = 1 - totalCost;
  const profitPercent = profitAmount / totalCost * 100;

  if (profitPercent < minProfitPercent) return null;

  // Calculate on $100 stake
  const stake = 100;
  const position = stake / 2; // Equal positions on both
  const yesPosition = position / bestLong.yesPrice;
  const noPosition = position / bestShort.noPrice;
  const guaranteedPayout = Math.min(yesPosition, noPosition);
  const profitOnStake = guaranteedPayout - stake;

  return {
    id: `arb_${match.eventId}_${outcome}_${Date.now()}`,
    eventId: match.eventId,
    marketId: match.markets[0].marketId, // Primary market
    outcomeName: outcome,
    longMarket: bestLong.market,
    shortMarket: bestShort.market,
    longPrice: bestLong.yesPrice,
    shortPrice: bestShort.noPrice,
    impliedBuyPrice: bestLong.yesPrice,
    impliedSellPrice: 1 - bestShort.noPrice,
    profitPercent,
    profitAmount: profitOnStake,
    volumeConstraint: Math.min(bestLong.liquidity, bestShort.liquidity),
    detectedAt: new Date().toISOString(),
    isActive: true,
  };
}

/**
 * Find +EV bets by comparing market prices to estimated true probabilities
 */
export function findPositiveEVBets(
  markets: Market[],
  estimates: Record<string, number>, // marketId -> true probability
  minEVPercent: number = 2
): any[] {
  const evBets: any[] = [];

  for (const market of markets) {
    const trueProb = estimates[market.id];
    if (!trueProb) continue;

    for (const [outcome, price] of Object.entries(market.outcomePrices)) {
      // EV = (TrueProb * Payout) - Stake
      // Payout = 1/price (decimal odds)
      const impliedProb = price;
      const edge = trueProb - impliedProb;
      const evPercent = edge / impliedProb * 100;

      if (evPercent > minEVPercent) {
        // Kelly criterion: f* = (bp - q) / b
        // where b = odds - 1, p = true prob, q = 1 - p
        const odds = 1 / impliedProb;
        const b = odds - 1;
        const p = trueProb;
        const q = 1 - p;
        const kellyFraction = Math.max(0, (b * p - q) / b);

        evBets.push({
          id: `ev_${market.id}_${outcome}_${Date.now()}`,
          marketId: market.id,
          outcomeName: outcome,
          market: market.market,
          marketPrice: impliedProb,
          estimatedTrueProb: trueProb,
          edgePercent: evPercent,
          kellyFraction: kellyFraction * 0.25, // Quarter Kelly for safety
          expectedValue: evPercent, // Simplified
          detectedAt: new Date().toISOString(),
        });
      }
    }
  }

  return evBets.sort((a, b) => b.edgePercent - a.edgePercent);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function normalizeQuestion(question: string): string {
  return question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 100);
}

function findEvent(
  events: Record<PredictionMarket, PredictionEvent[]>,
  eventId: string
): PredictionEvent | undefined {
  for (const marketEvents of Object.values(events)) {
    const event = marketEvents.find(e => e.id === eventId);
    if (event) return event;
  }
  return undefined;
}

function findCommonOutcomes(markets: Market[]): string[] {
  if (markets.length === 0) return [];
  
  const firstOutcomes = Object.keys(markets[0].outcomes);
  const common: string[] = [];

  for (const outcome of firstOutcomes) {
    const normalized = outcome.toLowerCase().trim();
    const isCommon = markets.every(m => {
      const outcomeKeys = Object.keys(m.outcomePrices);
      return outcomeKeys.some(o => o.toLowerCase().trim() === normalized);
    });
    if (isCommon) common.push(outcome);
  }

  return common;
}

function getComplementaryOutcome(
  outcomes: Record<string, number>,
  outcome: string
): string {
  const keys = Object.keys(outcomes);
  if (keys.length === 2) {
    return keys[0] === outcome ? keys[1] : keys[0];
  }
  return 'No'; // Default fallback
}

/**
 * Format arbitrage message for alerts
 */
export function formatArbitrageMessage(opp: ArbitrageOpportunity): string {
  const profitEmoji = opp.profitPercent >= 5 ? '🤑' : 
                     opp.profitPercent >= 3 ? '💰' : 
                     opp.profitPercent >= 1 ? '💵' : '📈';

  const eventTitle = opp.marketData?.event?.title || 'Unknown Event';
  const marketQuestion = opp.marketData?.market?.question || '';

  return `
${profitEmoji} *ARBITRAGE OPPORTUNITY*

📊 *${eventTitle}*
${marketQuestion ? `_${marketQuestion}_\n` : ''}
🎯 *Outcome:* ${opp.outcomeName}

💸 *BUY "YES" at:* ${opp.longMarket.toUpperCase()}
   Price: ${(opp.longPrice * 100).toFixed(1)}¢

💵 *BUY "NO" at:* ${opp.shortMarket.toUpperCase()}
   (Equivalent to selling Yes at ${(opp.impliedSellPrice * 100).toFixed(1)}¢)

📈 *PROFIT:* ${opp.profitPercent.toFixed(2)}% (${opp.profitAmount.toFixed(2)}% on stake)

⚠️ *Risk Factors:*
• Resolution timing differences
• Platform fees
• Liquidity constraints
• Currency/exchange rate risk

_Arb opportunities are rare and fleeting!_
`;
}

/**
 * Get best arbitrage opportunities from database
 */
export async function getBestArbitrageOps(
  allOpportunities: ArbitrageOpportunity[],
  limit: number = 10,
  minProfitPercent?: number
): Promise<ArbitrageOpportunity[]> {
  const threshold = minProfitPercent || DEFAULT_MIN_PROFIT_PERCENT;
  
  return allOpportunities
    .filter(o => o.profitPercent >= threshold && o.isActive)
    .sort((a, b) => b.profitPercent - a.profitPercent)
    .slice(0, limit);
}

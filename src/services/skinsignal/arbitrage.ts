/**
 * SkinSignal Arbitrage Engine — King Backend
 * Stateless spread detection across CS2 marketplaces
 */

import { ScrapeResult, SkinOpportunity, MARKETPLACE_FEES, Marketplace } from './types';
import { analyzeSpread } from './stats/analyzer';
import { SkinSpreadInput } from './stats/types';

function netPrice(priceUsd: number, market: Marketplace): number {
  const fee = MARKETPLACE_FEES[market] ?? 0;
  return priceUsd * (1 - fee);
}

/**
 * Compute arbitrage opportunities from multi-market scrape results for a single skin.
 * Returns array of opportunities (sorted by netSpreadPct desc).
 */
export async function detectOpportunities(
  scrapeResults: ScrapeResult[],
  minNetSpreadPct = 5,
  useDeepSeek = true,
): Promise<SkinOpportunity[]> {
  // Flatten all price points
  const prices = scrapeResults.flatMap(r => r.prices);
  if (prices.length < 2) return [];

  const skinName = scrapeResults[0]?.skinName ?? 'Unknown';

  const opportunities: SkinOpportunity[] = [];

  // Compare all buy/sell pairs
  for (const buy of prices) {
    for (const sell of prices) {
      if (buy.market === sell.market) continue;

      const netBuy = netPrice(buy.priceUsd, buy.market);
      const netSell = netPrice(sell.priceUsd, sell.market);
      const netSpread = netSell - netBuy;
      const netSpreadPct = netBuy > 0 ? (netSpread / netBuy) * 100 : 0;

      if (netSpreadPct < minNetSpreadPct) continue;

      const grossSpreadPct = buy.priceUsd > 0 ? ((sell.priceUsd - buy.priceUsd) / buy.priceUsd) * 100 : 0;

      let confidence = 0.5;
      let recommendation = netSpreadPct >= 15 ? 'execute' : netSpreadPct >= 10 ? 'monitor' : 'skip';
      const riskFactors: string[] = [];
      let estimatedDaysToSell = 7;

      // AI-enhanced analysis for high-value opportunities
      if (useDeepSeek && netSpreadPct >= 10) {
        try {
          const input: SkinSpreadInput = {
            skinName,
            prices: prices.map(p => ({
              marketplace: p.market,
              priceUsd: p.priceUsd,
              currency: p.currency,
              feePercent: (MARKETPLACE_FEES[p.market] ?? 0) * 100,
            })),
            timestamp: new Date().toISOString(),
          };
          const { data } = await analyzeSpread(input);
          if (data) {
            confidence = data.confidence;
            recommendation = data.recommendation;
            riskFactors.push(...data.riskFactors);
            estimatedDaysToSell = data.estimatedDaysToSell;
          }
        } catch {
          // graceful degradation
        }
      }

      opportunities.push({
        skinName,
        buyMarket: buy.market,
        sellMarket: sell.market,
        buyPriceUsd: buy.priceUsd,
        sellPriceUsd: sell.priceUsd,
        grossSpreadPct,
        netSpreadPct,
        confidence,
        recommendation,
        riskFactors,
        estimatedDaysToSell,
        detectedAt: new Date().toISOString(),
      });
    }
  }

  return opportunities.sort((a, b) => b.netSpreadPct - a.netSpreadPct);
}

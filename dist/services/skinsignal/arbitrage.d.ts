/**
 * SkinSignal Arbitrage Engine — King Backend
 * Stateless spread detection across CS2 marketplaces
 */
import { ScrapeResult, SkinOpportunity } from './types';
/**
 * Compute arbitrage opportunities from multi-market scrape results for a single skin.
 * Returns array of opportunities (sorted by netSpreadPct desc).
 */
export declare function detectOpportunities(scrapeResults: ScrapeResult[], minNetSpreadPct?: number, useDeepSeek?: boolean): Promise<SkinOpportunity[]>;
//# sourceMappingURL=arbitrage.d.ts.map
/**
 * Arbitrage Engine
 * Detects arbitrage opportunities across prediction markets
 * Reuses pattern from SpreadHunter/SkinSignal
 */
import { ArbitrageOpportunity, PredictionEvent, Market, PredictionMarket, CrossMarketMatch } from '../types';
/**
 * Match events/questions across markets
 */
export declare function matchMarketsAcrossPlatforms(events: Record<PredictionMarket, PredictionEvent[]>, markets: Record<PredictionMarket, Market[]>): CrossMarketMatch[];
/**
 * Detect arbitrage opportunities across matched markets
 */
export declare function detectArbitrage(matches: CrossMarketMatch[], minProfitPercent?: number): ArbitrageOpportunity[];
/**
 * Enhanced arbitrage detection with DeepSeek probability analysis
 */
export declare function detectArbitrageWithStats(matches: CrossMarketMatch[], minProfitPercent?: number): Promise<ArbitrageOpportunity[]>;
/**
 * Find +EV bets by comparing market prices to estimated true probabilities
 */
export declare function findPositiveEVBets(markets: Market[], estimates: Record<string, number>, // marketId -> true probability
minEVPercent?: number): any[];
/**
 * Format arbitrage message for alerts
 */
export declare function formatArbitrageMessage(opp: ArbitrageOpportunity): string;
/**
 * Get best arbitrage opportunities from database
 */
export declare function getBestArbitrageOps(allOpportunities: ArbitrageOpportunity[], limit?: number, minProfitPercent?: number): Promise<ArbitrageOpportunity[]>;
//# sourceMappingURL=arbitrage-engine.d.ts.map
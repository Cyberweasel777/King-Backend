/**
 * SkinSignal Types — King Backend service layer
 * CS2 skin arbitrage detection (stateless, no DB writes)
 */

export type Marketplace = 'steam' | 'buff163' | 'skinport' | 'csfloat';

export interface SkinPrice {
  market: Marketplace;
  currency: string;
  price: number;
  /** price in USD (converted from CNY for Buff163) */
  priceUsd: number;
  listingsCount: number;
  volume24h?: number;
  fetchedAt: string;
}

export interface ScrapeResult {
  market: Marketplace;
  skinName: string;
  prices: SkinPrice[];
  errors?: string[];
  scrapedAt: string;
}

export interface SpreadResult {
  skinName: string;
  buyMarket: Marketplace;
  sellMarket: Marketplace;
  buyPriceUsd: number;
  sellPriceUsd: number;
  grossSpreadUsd: number;
  grossSpreadPct: number;
  netSpreadUsd: number;
  netSpreadPct: number;
  confidence: number;
  recommendation: 'execute' | 'monitor' | 'skip' | 'risky';
  riskFactors: string[];
  estimatedDaysToSell: number;
  detectedAt: string;
}

export interface SkinOpportunity {
  skinName: string;
  buyMarket: Marketplace;
  sellMarket: Marketplace;
  buyPriceUsd: number;
  sellPriceUsd: number;
  grossSpreadPct: number;
  netSpreadPct: number;
  confidence: number;
  recommendation: string;
  riskFactors: string[];
  estimatedDaysToSell: number;
  detectedAt: string;
}

export const MARKETPLACE_FEES: Record<Marketplace, number> = {
  steam: 0.13,     // 13% transaction fee
  buff163: 0.025,  // 2.5% Buff163 fee
  skinport: 0.12,  // 12% Skinport seller fee
  csfloat: 0.02,   // 2% CSFloat fee
};

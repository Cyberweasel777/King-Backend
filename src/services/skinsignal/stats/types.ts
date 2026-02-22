/**
 * SkinSignal Stats Types — King Backend
 */

export interface SkinMarketEntry {
  marketplace: string;
  priceUsd: number;
  currency: string;
  feePercent: number;
}

export interface SkinSpreadInput {
  skinName: string;
  prices: SkinMarketEntry[];
  timestamp: string;
}

export interface SpreadAnalysis {
  skinName: string;
  bestBuy: { marketplace: string; priceUsd: number; netPrice: number };
  bestSell: { marketplace: string; priceUsd: number; netProceeds: number };
  grossSpread: number;
  netSpread: number;
  spreadPercent: number;
  annualizedReturn: number;
  confidence: number;
  recommendation: 'execute' | 'monitor' | 'skip' | 'risky';
  riskFactors: string[];
  estimatedDaysToSell: number;
}

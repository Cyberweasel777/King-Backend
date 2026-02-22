/**
 * SkinSignal Spread Analyzer — King Backend
 * DeepSeek AI-powered analysis with local fallback
 */

import { parseDeepSeekJson, DeepSeekOpts } from './deepseek-client';
import { statsCache, createCacheKey } from './cache';
import { SPREAD_ANALYSIS_PROMPT } from './prompts';
import { SpreadAnalysis, SkinSpreadInput } from './types';
import { MARKETPLACE_FEES } from '../types';

function netPrice(priceUsd: number, market: string): number {
  const fee = MARKETPLACE_FEES[market as keyof typeof MARKETPLACE_FEES] ?? 0;
  return priceUsd * (1 - fee);
}

function fallbackAnalysis(input: SkinSpreadInput): SpreadAnalysis {
  if (input.prices.length < 2) {
    return {
      skinName: input.skinName,
      bestBuy: { marketplace: 'n/a', priceUsd: 0, netPrice: 0 },
      bestSell: { marketplace: 'n/a', priceUsd: 0, netProceeds: 0 },
      grossSpread: 0,
      netSpread: 0,
      spreadPercent: 0,
      annualizedReturn: 0,
      confidence: 0,
      recommendation: 'skip',
      riskFactors: ['Insufficient price data'],
      estimatedDaysToSell: 7,
    };
  }

  const byNetPrice = [...input.prices].sort((a, b) => netPrice(a.priceUsd, a.marketplace) - netPrice(b.priceUsd, b.marketplace));
  const buy = byNetPrice[0];
  const sell = byNetPrice[byNetPrice.length - 1];

  const netBuy = netPrice(buy.priceUsd, buy.marketplace);
  const netSell = netPrice(sell.priceUsd, sell.marketplace);
  const grossSpread = sell.priceUsd - buy.priceUsd;
  const netSpread = netSell - netBuy;
  const spreadPct = netBuy > 0 ? (netSpread / netBuy) * 100 : 0;

  let rec: SpreadAnalysis['recommendation'] = 'skip';
  if (spreadPct > 10) rec = 'monitor';
  if (spreadPct > 15) rec = 'execute';

  return {
    skinName: input.skinName,
    bestBuy: { marketplace: buy.marketplace, priceUsd: buy.priceUsd, netPrice: netBuy },
    bestSell: { marketplace: sell.marketplace, priceUsd: sell.priceUsd, netProceeds: netSell },
    grossSpread,
    netSpread,
    spreadPercent: spreadPct,
    annualizedReturn: (spreadPct * 365) / 7,
    confidence: 0.5,
    recommendation: rec,
    riskFactors: ['Fallback calculation — DeepSeek API unavailable'],
    estimatedDaysToSell: 7,
  };
}

export async function analyzeSpread(
  input: SkinSpreadInput,
  opts?: DeepSeekOpts,
): Promise<{ data: SpreadAnalysis | null; fromApi: boolean; error?: string }> {
  const key = createCacheKey('ss:spread', { name: input.skinName, ts: Math.floor(Date.now() / 300_000) });
  const cached = statsCache.get<SpreadAnalysis>(key);
  if (cached) return { data: cached, fromApi: true };

  if (!process.env.DEEPSEEK_API_KEY) {
    const data = fallbackAnalysis(input);
    statsCache.set(key, data);
    return { data, fromApi: false };
  }

  const result = await parseDeepSeekJson<Omit<SpreadAnalysis, 'skinName'>>(
    SPREAD_ANALYSIS_PROMPT,
    JSON.stringify(input, null, 2),
    () => {
      const fb = fallbackAnalysis(input);
      const { skinName: _, ...rest } = fb;
      return rest;
    },
    opts,
  );

  const data: SpreadAnalysis | null = result.data
    ? { skinName: input.skinName, ...result.data, confidence: Math.max(0, Math.min(1, result.data.confidence)) }
    : null;

  if (data) statsCache.set(key, data);

  return { data, fromApi: result.fromApi, error: result.error };
}

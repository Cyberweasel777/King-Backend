/**
 * MemeRadar service facade for King Backend
 * Provides token discovery + trending + whale transactions.
 */

import { DexScreenerScraper } from './scrapers/dexscreener';
import { HeliusScraper } from './scrapers/helius';
import type { TokenData, TrendingToken, WhaleTransaction } from './types';

const dex = new DexScreenerScraper();

function getHelius(): HeliusScraper | null {
  const key = process.env.HELIUS_API_KEY;
  if (!key) return null;
  return new HeliusScraper(key);
}

export async function getTokens(params?: { q?: string; limit?: number; chain?: string }): Promise<TokenData[]> {
  const limit = Math.min(params?.limit ?? 20, 50);
  const q = params?.q?.trim();
  if (q) return dex.searchTokens(q);

  // Default: trending Solana memecoins
  const trending = await dex.getTrendingSolana(limit);
  return trending.map((t) => t.token);
}

export async function getTrending(params?: { limit?: number; chain?: 'solana' | 'base' }): Promise<TrendingToken[]> {
  const limit = Math.min(params?.limit ?? 20, 50);
  const chain = params?.chain ?? 'solana';
  if (chain === 'solana') return dex.getTrendingSolana(limit);
  // For now, reuse search as a proxy for base trending
  const tokens = await dex.searchTokens('base');
  return tokens.slice(0, limit).map((token, i) => ({
    rank: i + 1,
    token,
    trendingScore: token.volume24h + token.liquidityUsd,
  }));
}

export async function getWhales(params: { wallet: string; limit?: number }): Promise<WhaleTransaction[]> {
  const helius = getHelius();
  if (!helius) return [];
  const limit = Math.min(params.limit ?? 50, 100);
  return helius.getWalletTransactions(params.wallet, limit);
}

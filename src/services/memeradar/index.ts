/**
 * MemeRadar service facade for King Backend
 * Provides token discovery + trending + whale transactions.
 */

import { DexScreenerScraper } from './scrapers/dexscreener';
import { HeliusScraper } from './scrapers/helius';
import type { TokenData, TrendingToken, WhaleTransaction } from './types';
import { buildProvenanceReport, type ProvenanceReport } from './provenance';
import { evaluateAlerts, type AlertTelemetry, type TriggeredAlert } from './alerts';

type WhalesDebugInfo = {
  signaturesFetched: number;
  txDetailsAttempted: number;
  txDetailsSucceeded: number;
  parsedTransfers: number;
  firstError?: string;
  heliusStatusCodes?: { getSignaturesForAddress?: number; getTransaction: number[] };
};

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

export async function getWhalesWithDebug(params: {
  wallet: string;
  limit?: number;
}): Promise<{ whales: WhaleTransaction[]; debug: WhalesDebugInfo }> {
  const helius = getHelius();
  const limit = Math.min(params.limit ?? 50, 100);

  if (!helius) {
    return {
      whales: [],
      debug: {
        signaturesFetched: 0,
        txDetailsAttempted: 0,
        txDetailsSucceeded: 0,
        parsedTransfers: 0,
        firstError: 'helius_not_configured',
        heliusStatusCodes: { getTransaction: [] },
      },
    };
  }

  const { transactions, debug } = await helius.getWalletTransactionsWithDebug(params.wallet, limit);
  return { whales: transactions, debug };
}

export async function resolveToken(identifier: string, chain: 'solana' | 'base' = 'solana'): Promise<TokenData | null> {
  const q = identifier.trim();
  if (!q) return null;

  // Address-ish input goes straight to token endpoint first.
  const maybeAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(q) || /^0x[a-fA-F0-9]{40}$/.test(q);
  if (maybeAddress) {
    const byAddress = await dex.getTokenByAddress(q, chain);
    if (byAddress) return byAddress;
  }

  const found = await dex.searchTokens(q);
  return found.find((t) => t.chain === chain) || found[0] || null;
}

export async function getTokenReport(identifier: string, chain: 'solana' | 'base' = 'solana'): Promise<{ token: TokenData; provenance: ProvenanceReport } | null> {
  const token = await resolveToken(identifier, chain);
  if (!token) return null;

  if (token.chain === 'solana') {
    const helius = getHelius();
    if (helius) {
      token.holders = await helius.getTokenHolders(token.address);
    }
  }

  return {
    token,
    provenance: buildProvenanceReport(token),
  };
}

export function evaluateTokenAlerts(telemetry: AlertTelemetry): TriggeredAlert[] {
  return evaluateAlerts(telemetry);
}

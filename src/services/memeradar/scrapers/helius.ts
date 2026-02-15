/**
 * Helius Scraper
 * Monitors Solana blockchain for whale wallets, new tokens, and transactions
 * Uses Helius API for enhanced RPC capabilities
 */

import { BaseScraper } from './base-scraper';
import { WhaleTransaction, TrackedWallet } from '../shared/types';
import { createLogger } from '../shared/logger';
import { tokenCache } from '../shared/cache';

const logger = createLogger('Helius');

interface TokenMetadata {
  mint: string;
  name: string;
  symbol: string;
  decimals: number;
  image?: string;
  description?: string;
}

interface HeliusAssetResponse {
  result?: {
    content?: {
      metadata?: {
        name?: string;
        symbol?: string;
        description?: string;
      };
      files?: Array<{ uri?: string }>;
    };
    token_info?: {
      decimals?: number;
    };
  };
}

interface HeliusTxResponse {
  result?: {
    blockTime?: number;
    meta?: {
      fee?: number;
      preBalances?: number[];
      postBalances?: number[];
      preTokenBalances?: Array<{
        accountIndex: number;
        mint: string;
        uiTokenAmount?: { uiAmount?: number };
      }>;
      postTokenBalances?: Array<{
        accountIndex: number;
        mint: string;
        uiTokenAmount?: { uiAmount?: number };
      }>;
    };
    transaction?: {
      message?: {
        accountKeys?: string[];
      };
    };
  };
}

interface HeliusSignaturesResponse {
  result?: Array<{ signature: string }>;
}

interface HeliusHoldersResponse {
  result?: {
    token_accounts?: unknown[];
  };
}

type WhalesDebugInfo = {
  signaturesFetched: number;
  txDetailsAttempted: number;
  txDetailsSucceeded: number;
  parsedTransfers: number;
  firstError?: string;
  heliusStatusCodes?: {
    getSignaturesForAddress?: number;
    getTransaction: number[];
  };
};

export class HeliusScraper extends BaseScraper {
  private baseUrl: string;
  private trackedWallets: Map<string, TrackedWallet> = new Map();

  constructor(apiKey: string) {
    super({
      name: 'Helius',
      rateLimitMs: 500, // 2 req/sec for free tier
      maxRetries: 3,
      timeoutMs: 15000,
    });
    this.baseUrl = `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
  }

  /**
   * Track a whale wallet
   */
  trackWallet(address: string, label?: string, tags: string[] = []): TrackedWallet {
    const wallet: TrackedWallet = {
      address,
      label,
      chain: 'solana',
      addedAt: new Date().toISOString(),
      totalTrades: 0,
      winRate: 0,
      avgReturn: 0,
      tags,
    };
    
    this.trackedWallets.set(address, wallet);
    logger.info(`Started tracking wallet: ${label || address}`);
    return wallet;
  }

  /**
   * Stop tracking a wallet
   */
  untrackWallet(address: string): boolean {
    const existed = this.trackedWallets.delete(address);
    if (existed) logger.info(`Stopped tracking wallet: ${address}`);
    return existed;
  }

  /**
   * Get wallet transactions
   */
  async getWalletTransactions(
    wallet: string, 
    limit: number = 100
  ): Promise<WhaleTransaction[]> {
    const txDetailsLimit = 10;

    const cacheKey = `helius:txs:${wallet}:${limit}`;
    const cached = tokenCache.get<WhaleTransaction[]>(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.withRetry(async () => {
        await this.rateLimit();
        const res = await this.fetchWithTimeout(this.baseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'helius-test',
            method: 'getSignaturesForAddress',
            params: [wallet, { limit }],
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res;
      });

      const data = await response.json() as HeliusSignaturesResponse;
      const signatures = data.result || [];

      // Fetch transaction details for each signature
      const transactions: WhaleTransaction[] = [];
      for (const sig of signatures.slice(0, txDetailsLimit)) {
        const tx = await this.getTransactionDetails(sig.signature);
        if (tx) transactions.push(tx);
      }

      tokenCache.set(cacheKey, transactions, 60000); // 1 minute cache
      return transactions;
    } catch (error) {
      logger.error(`Failed to fetch wallet transactions for ${wallet}`, error);
      return [];
    }
  }

  /**
   * Get wallet transactions with debug instrumentation.
   * NOTE: bypasses cache so counters represent actual work performed.
   */
  async getWalletTransactionsWithDebug(
    wallet: string,
    limit: number = 100
  ): Promise<{ transactions: WhaleTransaction[]; debug: WhalesDebugInfo }> {
    const txDetailsLimit = 10;

    const debug: WhalesDebugInfo = {
      signaturesFetched: 0,
      txDetailsAttempted: 0,
      txDetailsSucceeded: 0,
      parsedTransfers: 0,
      heliusStatusCodes: { getTransaction: [] },
    };

    try {
      const response = await this.withRetry(async () => {
        await this.rateLimit();
        const res = await this.fetchWithTimeout(this.baseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'helius-test',
            method: 'getSignaturesForAddress',
            params: [wallet, { limit }],
          }),
        });
        debug.heliusStatusCodes!.getSignaturesForAddress = res.status;
        if (!res.ok) {
          if (!debug.firstError) debug.firstError = `getSignaturesForAddress HTTP ${res.status}`;
          throw new Error(`HTTP ${res.status}`);
        }
        return res;
      });

      const data = (await response.json()) as HeliusSignaturesResponse;
      const signatures = data.result || [];
      debug.signaturesFetched = signatures.length;

      const transactions: WhaleTransaction[] = [];
      for (const sig of signatures.slice(0, txDetailsLimit)) {
        debug.txDetailsAttempted += 1;
        const tx = await this.getTransactionDetails(sig.signature, debug);
        if (tx) transactions.push(tx);
      }

      logger.debug(
        `whales(debug) wallet=${wallet} txDetailsLimit=${txDetailsLimit} signaturesFetched=${debug.signaturesFetched} txDetailsAttempted=${debug.txDetailsAttempted} txDetailsSucceeded=${debug.txDetailsSucceeded} parsedTransfers=${debug.parsedTransfers}`
      );

      return { transactions, debug };
    } catch (error) {
      if (!debug.firstError) debug.firstError = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to fetch wallet transactions for ${wallet} (debug)`, error);
      return { transactions: [], debug };
    }
  }

  /**
   * Get transaction details by signature
   */
  async getTransactionDetails(signature: string, debug?: WhalesDebugInfo): Promise<WhaleTransaction | null> {
    try {
      const response = await this.withRetry(async () => {
        await this.rateLimit();
        const res = await this.fetchWithTimeout(this.baseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'helius-test',
            method: 'getTransaction',
            params: [signature, { maxSupportedTransactionVersion: 0 }],
          }),
        });
        if (debug?.heliusStatusCodes) debug.heliusStatusCodes.getTransaction.push(res.status);
        if (!res.ok) {
          if (debug && !debug.firstError) debug.firstError = `getTransaction HTTP ${res.status}`;
          throw new Error(`HTTP ${res.status}`);
        }
        return res;
      });

      const data = (await response.json()) as HeliusTxResponse;
      const tx = data.result;

      if (!tx || !tx.meta) return null;

      // Parse token transfers from transaction
      const tokenTransfers = this.parseTokenTransfers(tx);
      if (debug) debug.parsedTransfers += tokenTransfers.length;
      if (tokenTransfers.length === 0) return null;

      const transfer = tokenTransfers[0];
      if (debug) debug.txDetailsSucceeded += 1;
      
      return {
        signature,
        wallet: tx.transaction?.message?.accountKeys?.[0] || '',
        tokenIn: transfer.tokenIn,
        tokenOut: transfer.tokenOut,
        amountIn: transfer.amountIn,
        amountOut: transfer.amountOut,
        valueUsd: 0, // Would need price data
        timestamp: new Date((tx.blockTime || 0) * 1000).toISOString(),
        type: transfer.type,
        chain: 'solana',
      };
    } catch (error) {
      if (debug && !debug.firstError) debug.firstError = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to fetch transaction ${signature}`, error);
      return null;
    }
  }

  /**
   * Get token metadata
   */
  async getTokenMetadata(mint: string): Promise<TokenMetadata | null> {
    const cacheKey = `helius:metadata:${mint}`;
    const cached = tokenCache.get<TokenMetadata>(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.withRetry(async () => {
        await this.rateLimit();
        const res = await this.fetchWithTimeout(this.baseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'helius-test',
            method: 'getAsset',
            params: { id: mint },
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res;
      });

      const data = await response.json() as HeliusAssetResponse;
      const asset = data.result;

      if (!asset) return null;

      const metadata: TokenMetadata = {
        mint,
        name: asset.content?.metadata?.name || 'Unknown',
        symbol: asset.content?.metadata?.symbol || 'UNKNOWN',
        decimals: asset.token_info?.decimals || 0,
        image: asset.content?.files?.[0]?.uri,
        description: asset.content?.metadata?.description,
      };

      tokenCache.set(cacheKey, metadata, 3600000); // 1 hour cache
      return metadata;
    } catch (error) {
      logger.error(`Failed to fetch metadata for ${mint}`, error);
      return null;
    }
  }

  /**
   * Get token holders count
   */
  async getTokenHolders(mint: string): Promise<number> {
    try {
      const response = await this.withRetry(async () => {
        await this.rateLimit();
        const res = await this.fetchWithTimeout(this.baseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'helius-test',
            method: 'getTokenAccounts',
            params: {
              mint,
              options: { limit: 1000 },
            },
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res;
      });

      const data = await response.json() as HeliusHoldersResponse;
      return data.result?.token_accounts?.length || 0;
    } catch (error) {
      logger.error(`Failed to fetch holders for ${mint}`, error);
      return 0;
    }
  }

  /**
   * Monitor all tracked wallets for new transactions
   */
  async monitorTrackedWallets(): Promise<WhaleTransaction[]> {
    const allTransactions: WhaleTransaction[] = [];

    for (const [address, wallet] of this.trackedWallets) {
      logger.debug(`Monitoring wallet: ${wallet.label || address}`);
      const txs = await this.getWalletTransactions(address, 10);
      
      // Filter for recent transactions (last 5 minutes)
      const recentTxs = txs.filter(tx => {
        const txTime = new Date(tx.timestamp).getTime();
        return Date.now() - txTime < 300000; // 5 minutes
      });

      allTransactions.push(...recentTxs);
    }

    return allTransactions.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  /**
   * Main scrape method for scheduled runs
   */
  async scrape(): Promise<{
    transactions: WhaleTransaction[];
    wallets: TrackedWallet[];
  }> {
    const transactions = await this.monitorTrackedWallets();
    const wallets = Array.from(this.trackedWallets.values());

    return { transactions, wallets };
  }

  // Helper methods
  private parseTokenTransfers(tx: HeliusTxResponse['result']): Array<{
    tokenIn: string;
    tokenOut: string;
    amountIn: number;
    amountOut: number;
    type: 'buy' | 'sell' | 'swap';
  }> {
    if (!tx || !tx.meta) return [];

    const transfers: Array<{
      tokenIn: string;
      tokenOut: string;
      amountIn: number;
      amountOut: number;
      type: 'buy' | 'sell' | 'swap';
    }> = [];

    // This is a simplified parser - real implementation would be more complex
    const preBalances = tx.meta.preTokenBalances || [];
    const postBalances = tx.meta.postTokenBalances || [];

    // Find token balance changes
    const changes = new Map<string, number>();
    
    for (const post of postBalances) {
      const pre = preBalances.find((p) => 
        p.accountIndex === post.accountIndex && p.mint === post.mint
      );
      
      const preAmount = pre?.uiTokenAmount?.uiAmount || 0;
      const postAmount = post.uiTokenAmount?.uiAmount || 0;
      const change = postAmount - preAmount;
      
      if (change !== 0) {
        changes.set(post.mint, (changes.get(post.mint) || 0) + change);
      }
    }

    // Determine if it's a buy or sell based on SOL changes
    const preSol = tx.meta.preBalances?.[0] || 0;
    const postSol = tx.meta.postBalances?.[0] || 0;
    const solChange = (postSol - preSol + (tx.meta.fee || 0)) / 1e9;

    // If SOL decreased and tokens increased -> buy
    // If SOL increased and tokens decreased -> sell
    for (const [mint, amount] of changes) {
      if (mint === 'So11111111111111111111111111111111111111112') continue; // Skip SOL
      
      const type: 'buy' | 'sell' | 'swap' = 
        solChange < 0 && amount > 0 ? 'buy' :
        solChange > 0 && amount < 0 ? 'sell' : 'swap';

      transfers.push({
        tokenIn: type === 'buy' ? 'SOL' : mint,
        tokenOut: type === 'buy' ? mint : 'SOL',
        amountIn: Math.abs(type === 'buy' ? solChange : amount),
        amountOut: Math.abs(type === 'buy' ? amount : solChange),
        type,
      });
    }

    return transfers;
  }
}

export default HeliusScraper;

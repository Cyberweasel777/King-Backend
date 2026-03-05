"use strict";
/**
 * Helius Scraper
 * Monitors Solana blockchain for whale wallets, new tokens, and transactions
 * Uses Helius API for enhanced RPC capabilities
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HeliusScraper = void 0;
const base_scraper_1 = require("./base-scraper");
const logger_1 = require("../shared/logger");
const cache_1 = require("../shared/cache");
const logger = (0, logger_1.createLogger)('Helius');
function formatAmount(n) {
    if (!Number.isFinite(n))
        return '0';
    const abs = Math.abs(n);
    if (abs === 0)
        return '0';
    // Keep small numbers readable without sci-notation.
    if (abs < 1e-6)
        return n.toFixed(12).replace(/0+$/, '').replace(/\.$/, '');
    if (abs < 1)
        return n.toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
    return n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}
class HeliusScraper extends base_scraper_1.BaseScraper {
    baseUrl;
    trackedWallets = new Map();
    constructor(apiKey) {
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
    trackWallet(address, label, tags = []) {
        const wallet = {
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
    untrackWallet(address) {
        const existed = this.trackedWallets.delete(address);
        if (existed)
            logger.info(`Stopped tracking wallet: ${address}`);
        return existed;
    }
    /**
     * Get wallet transactions
     */
    async getWalletTransactions(wallet, limit = 100) {
        const txDetailsLimit = 10;
        const effectiveLimit = Math.min(limit, txDetailsLimit);
        const cacheKey = `helius:txs:${wallet}:${effectiveLimit}`;
        const cached = cache_1.tokenCache.get(cacheKey);
        if (cached)
            return cached;
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
                        params: [wallet, { limit: effectiveLimit }],
                    }),
                });
                if (!res.ok)
                    throw new Error(`HTTP ${res.status}`);
                return res;
            });
            const data = await response.json();
            const signatures = data.result || [];
            // Fetch transaction details for each signature
            const transactions = [];
            for (const sig of signatures.slice(0, effectiveLimit)) {
                const tx = await this.getTransactionDetails(sig.signature);
                if (tx)
                    transactions.push(tx);
            }
            cache_1.tokenCache.set(cacheKey, transactions, 60000); // 1 minute cache
            return transactions;
        }
        catch (error) {
            logger.error(`Failed to fetch wallet transactions for ${wallet}`, error);
            return [];
        }
    }
    /**
     * Get wallet transactions with debug instrumentation.
     * NOTE: bypasses cache so counters represent actual work performed.
     */
    async getWalletTransactionsWithDebug(wallet, limit = 100) {
        const txDetailsLimit = 10;
        const effectiveLimit = Math.min(limit, txDetailsLimit);
        const debug = {
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
                        params: [wallet, { limit: effectiveLimit }],
                    }),
                });
                debug.heliusStatusCodes.getSignaturesForAddress = res.status;
                if (!res.ok) {
                    if (!debug.firstError)
                        debug.firstError = `getSignaturesForAddress HTTP ${res.status}`;
                    throw new Error(`HTTP ${res.status}`);
                }
                return res;
            });
            const data = (await response.json());
            const signatures = data.result || [];
            debug.signaturesFetched = signatures.length;
            const transactions = [];
            for (const sig of signatures.slice(0, effectiveLimit)) {
                debug.txDetailsAttempted += 1;
                const tx = await this.getTransactionDetails(sig.signature, debug);
                if (tx)
                    transactions.push(tx);
            }
            logger.debug(`whales(debug) wallet=${wallet} txDetailsLimit=${txDetailsLimit} signaturesFetched=${debug.signaturesFetched} txDetailsAttempted=${debug.txDetailsAttempted} txDetailsSucceeded=${debug.txDetailsSucceeded} parsedTransfers=${debug.parsedTransfers}`);
            return { transactions, debug };
        }
        catch (error) {
            if (!debug.firstError)
                debug.firstError = error instanceof Error ? error.message : String(error);
            logger.error(`Failed to fetch wallet transactions for ${wallet} (debug)`, error);
            return { transactions: [], debug };
        }
    }
    /**
     * Get transaction details by signature
     */
    async getTransactionDetails(signature, debug) {
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
                if (debug?.heliusStatusCodes)
                    debug.heliusStatusCodes.getTransaction.push(res.status);
                if (!res.ok) {
                    if (debug && !debug.firstError)
                        debug.firstError = `getTransaction HTTP ${res.status}`;
                    throw new Error(`HTTP ${res.status}`);
                }
                return res;
            });
            const data = (await response.json());
            const tx = data.result;
            if (!tx || !tx.meta)
                return null;
            // Parse token transfers from transaction
            const tokenTransfers = this.parseTokenTransfers(tx);
            if (debug)
                debug.parsedTransfers += tokenTransfers.length;
            if (tokenTransfers.length === 0)
                return null;
            const transfer = tokenTransfers[0];
            if (debug)
                debug.txDetailsSucceeded += 1;
            return {
                signature,
                solscanUrl: `https://solscan.io/tx/${signature}`,
                wallet: tx.transaction?.message?.accountKeys?.[0] || '',
                tokenIn: transfer.tokenIn,
                tokenOut: transfer.tokenOut,
                amountIn: transfer.amountIn,
                amountOut: transfer.amountOut,
                amountInDisplay: formatAmount(transfer.amountIn),
                amountOutDisplay: formatAmount(transfer.amountOut),
                valueUsd: 0, // Would need price data
                timestamp: new Date((tx.blockTime || 0) * 1000).toISOString(),
                type: transfer.type,
                chain: 'solana',
            };
        }
        catch (error) {
            if (debug && !debug.firstError)
                debug.firstError = error instanceof Error ? error.message : String(error);
            logger.error(`Failed to fetch transaction ${signature}`, error);
            return null;
        }
    }
    /**
     * Get token metadata
     */
    async getTokenMetadata(mint) {
        const cacheKey = `helius:metadata:${mint}`;
        const cached = cache_1.tokenCache.get(cacheKey);
        if (cached)
            return cached;
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
                if (!res.ok)
                    throw new Error(`HTTP ${res.status}`);
                return res;
            });
            const data = await response.json();
            const asset = data.result;
            if (!asset)
                return null;
            const metadata = {
                mint,
                name: asset.content?.metadata?.name || 'Unknown',
                symbol: asset.content?.metadata?.symbol || 'UNKNOWN',
                decimals: asset.token_info?.decimals || 0,
                image: asset.content?.files?.[0]?.uri,
                description: asset.content?.metadata?.description,
            };
            cache_1.tokenCache.set(cacheKey, metadata, 3600000); // 1 hour cache
            return metadata;
        }
        catch (error) {
            logger.error(`Failed to fetch metadata for ${mint}`, error);
            return null;
        }
    }
    /**
     * Get token holders count
     */
    async getTokenHolders(mint) {
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
                if (!res.ok)
                    throw new Error(`HTTP ${res.status}`);
                return res;
            });
            const data = await response.json();
            return data.result?.token_accounts?.length || 0;
        }
        catch (error) {
            logger.error(`Failed to fetch holders for ${mint}`, error);
            return 0;
        }
    }
    /**
     * Monitor all tracked wallets for new transactions
     */
    async monitorTrackedWallets() {
        const allTransactions = [];
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
        return allTransactions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }
    /**
     * Main scrape method for scheduled runs
     */
    async scrape() {
        const transactions = await this.monitorTrackedWallets();
        const wallets = Array.from(this.trackedWallets.values());
        return { transactions, wallets };
    }
    // Helper methods
    parseTokenTransfers(tx) {
        if (!tx || !tx.meta)
            return [];
        const transfers = [];
        // This is a simplified parser - real implementation would be more complex
        const preBalances = tx.meta.preTokenBalances || [];
        const postBalances = tx.meta.postTokenBalances || [];
        // Find token balance changes
        const changes = new Map();
        for (const post of postBalances) {
            const pre = preBalances.find((p) => p.accountIndex === post.accountIndex && p.mint === post.mint);
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
            if (mint === 'So11111111111111111111111111111111111111112')
                continue; // Skip SOL
            const type = solChange < 0 && amount > 0 ? 'buy' :
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
exports.HeliusScraper = HeliusScraper;
exports.default = HeliusScraper;
//# sourceMappingURL=helius.js.map
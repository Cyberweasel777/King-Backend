/**
 * Helius Scraper
 * Monitors Solana blockchain for whale wallets, new tokens, and transactions
 * Uses Helius API for enhanced RPC capabilities
 */
import { BaseScraper } from './base-scraper';
import { WhaleTransaction, TrackedWallet } from '../shared/types';
interface TokenMetadata {
    mint: string;
    name: string;
    symbol: string;
    decimals: number;
    image?: string;
    description?: string;
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
export declare class HeliusScraper extends BaseScraper {
    private baseUrl;
    private trackedWallets;
    constructor(apiKey: string);
    /**
     * Track a whale wallet
     */
    trackWallet(address: string, label?: string, tags?: string[]): TrackedWallet;
    /**
     * Stop tracking a wallet
     */
    untrackWallet(address: string): boolean;
    /**
     * Get wallet transactions
     */
    getWalletTransactions(wallet: string, limit?: number): Promise<WhaleTransaction[]>;
    /**
     * Get wallet transactions with debug instrumentation.
     * NOTE: bypasses cache so counters represent actual work performed.
     */
    getWalletTransactionsWithDebug(wallet: string, limit?: number): Promise<{
        transactions: WhaleTransaction[];
        debug: WhalesDebugInfo;
    }>;
    /**
     * Get transaction details by signature
     */
    getTransactionDetails(signature: string, debug?: WhalesDebugInfo): Promise<WhaleTransaction | null>;
    /**
     * Get token metadata
     */
    getTokenMetadata(mint: string): Promise<TokenMetadata | null>;
    /**
     * Get token holders count
     */
    getTokenHolders(mint: string): Promise<number>;
    /**
     * Monitor all tracked wallets for new transactions
     */
    monitorTrackedWallets(): Promise<WhaleTransaction[]>;
    /**
     * Main scrape method for scheduled runs
     */
    scrape(): Promise<{
        transactions: WhaleTransaction[];
        wallets: TrackedWallet[];
    }>;
    private parseTokenTransfers;
}
export default HeliusScraper;
//# sourceMappingURL=helius.d.ts.map
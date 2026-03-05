/**
 * Shared Types for MemeRadar System
 * Used across all agents
 */
export interface TokenData {
    address: string;
    symbol: string;
    name: string;
    chain: 'solana' | 'base' | 'ethereum' | 'bsc';
    priceUsd: number;
    marketCap: number;
    liquidityUsd: number;
    volume24h: number;
    priceChange24h: number;
    priceChange1h: number;
    holders: number;
    timestamp: string;
    dexUrl: string;
    metadata?: {
        creator?: string;
        createdAt?: string;
        lpLocked?: boolean;
        lpLockDuration?: number;
        mintAuthority?: string;
        freezeAuthority?: string;
        warnings?: string[];
    };
}
export interface TrendingToken {
    rank: number;
    token: TokenData;
    boostCount?: number;
    trendingScore: number;
}
export interface WhaleTransaction {
    signature: string;
    /** Convenience link for UI */
    solscanUrl?: string;
    wallet: string;
    tokenIn: string;
    tokenOut: string;
    amountIn: number;
    amountOut: number;
    /** Pre-formatted amounts for UI (avoids scientific notation) */
    amountInDisplay?: string;
    amountOutDisplay?: string;
    valueUsd: number;
    timestamp: string;
    type: 'buy' | 'sell' | 'swap';
    chain: string;
}
export interface TrackedWallet {
    address: string;
    label?: string;
    chain: string;
    addedAt: string;
    totalTrades: number;
    winRate: number;
    avgReturn: number;
    tags: string[];
}
export interface SentimentData {
    token: string;
    platform: 'twitter' | 'telegram' | 'discord';
    sentiment: number;
    volume: number;
    engagement: number;
    trending: boolean;
    timestamp: string;
    topPosts?: string[];
}
export interface RiskAnalysis {
    token: string;
    overallScore: number;
    factors: RiskFactor[];
    redFlags: string[];
    greenFlags: string[];
    timestamp: string;
}
export interface RiskFactor {
    name: string;
    score: number;
    weight: number;
    description: string;
}
export interface PriceAlert {
    id: string;
    userId: number;
    token: string;
    condition: 'above' | 'below' | 'change';
    threshold: number;
    triggered: boolean;
    createdAt: string;
}
export interface UserPortfolio {
    userId: number;
    tokens: TrackedToken[];
    wallets: TrackedWallet[];
    alerts: PriceAlert[];
    updatedAt: string;
}
export interface TrackedToken {
    address: string;
    symbol: string;
    addedAt: string;
    avgBuyPrice?: number;
    notes?: string;
}
export interface ScraperConfig {
    name: string;
    rateLimitMs: number;
    maxRetries: number;
    timeoutMs: number;
}
export type MemeRadarEvent = {
    type: 'TOKEN_DISCOVERED';
    data: TokenData;
} | {
    type: 'PRICE_UPDATE';
    data: TokenData;
} | {
    type: 'WHALE_TRADE';
    data: WhaleTransaction;
} | {
    type: 'SENTIMENT_UPDATE';
    data: SentimentData;
} | {
    type: 'RISK_UPDATE';
    data: RiskAnalysis;
} | {
    type: 'ALERT_TRIGGERED';
    data: {
        alert: PriceAlert;
        token: TokenData;
    };
};
export interface QueueMessage {
    id: string;
    timestamp: string;
    priority: number;
    payload: MemeRadarEvent;
}
//# sourceMappingURL=types.d.ts.map
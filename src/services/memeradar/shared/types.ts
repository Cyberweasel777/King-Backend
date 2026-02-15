/**
 * Shared Types for MemeRadar System
 * Used across all agents
 */

// Token data from DexScreener or other sources
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

// Trending token from DexScreener
export interface TrendingToken {
  rank: number;
  token: TokenData;
  boostCount?: number;
  trendingScore: number;
}

// Whale wallet transaction
export interface WhaleTransaction {
  signature: string;
  wallet: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: number;
  amountOut: number;
  valueUsd: number;
  timestamp: string;
  type: 'buy' | 'sell' | 'swap';
  chain: string;
}

// Wallet being tracked
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

// Social sentiment data
export interface SentimentData {
  token: string;
  platform: 'twitter' | 'telegram' | 'discord';
  sentiment: number; // -1 to 1
  volume: number; // mention count
  engagement: number; // likes + retweets
  trending: boolean;
  timestamp: string;
  topPosts?: string[];
}

// Risk analysis result
export interface RiskAnalysis {
  token: string;
  overallScore: number; // 0-100 (higher = safer)
  factors: RiskFactor[];
  redFlags: string[];
  greenFlags: string[];
  timestamp: string;
}

export interface RiskFactor {
  name: string;
  score: number; // 0-100
  weight: number;
  description: string;
}

// User alert
export interface PriceAlert {
  id: string;
  userId: number;
  token: string;
  condition: 'above' | 'below' | 'change';
  threshold: number;
  triggered: boolean;
  createdAt: string;
}

// User portfolio
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

// Scraper configuration
export interface ScraperConfig {
  name: string;
  rateLimitMs: number;
  maxRetries: number;
  timeoutMs: number;
}

// Event types for agent communication
export type MemeRadarEvent =
  | { type: 'TOKEN_DISCOVERED'; data: TokenData }
  | { type: 'PRICE_UPDATE'; data: TokenData }
  | { type: 'WHALE_TRADE'; data: WhaleTransaction }
  | { type: 'SENTIMENT_UPDATE'; data: SentimentData }
  | { type: 'RISK_UPDATE'; data: RiskAnalysis }
  | { type: 'ALERT_TRIGGERED'; data: { alert: PriceAlert; token: TokenData } };

// Message queue item
export interface QueueMessage {
  id: string;
  timestamp: string;
  priority: number;
  payload: MemeRadarEvent;
}

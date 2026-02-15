/**
 * ArbWatch Type Definitions
 * Prediction market arbitrage types
 * Based on SpreadHunter patterns, adapted for prediction markets
 */

// ============================================================================
// DATABASE TYPES
// ============================================================================

export interface User {
  id: string;
  telegramId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  languageCode?: string;
  isPremium: boolean;
  createdAt: string;
  updatedAt: string;
  lastActive: string;
  isActive: boolean;
}

export type PredictionMarket = 'polymarket' | 'kalshi' | 'betfair' | 'smarkets' | 'draftkings' | 'other';

export type EventStatus = 'active' | 'paused' | 'resolved' | 'cancelled';

export interface PredictionEvent {
  id: string;
  title: string;
  description?: string;
  category: string;
  subcategory?: string;
  imageUrl?: string;
  resolutionSource?: string;
  resolutionTime?: string;
  status: EventStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Market {
  id: string;
  eventId: string;
  marketSlug: string;
  question: string;
  description?: string;
  outcomes: string[];
  outcomePrices: Record<string, number>; // price 0-1 representing probability
  volume24h: number;
  volumeTotal: number;
  liquidity: number;
  endDate?: string;
  status: EventStatus;
  sourceMarketId: string; // ID from the prediction market API
  market: PredictionMarket;
  createdAt: string;
  updatedAt: string;
}

export interface OddsSnapshot {
  id: string;
  marketId: string;
  market: PredictionMarket;
  outcomes: Record<string, number>; // outcome -> probability (0-1)
  impliedProbabilities: Record<string, number>; // after vig adjustment
  totalVolume: number;
  liquidity: number;
  timestamp: string;
}

export interface TrackedMarket {
  id: string;
  userId: string;
  marketId: string;
  alertOnArbitrage: boolean;
  minProfitPercent: number;
  targetMarkets: PredictionMarket[];
  createdAt: string;
}

export interface ArbitrageOpportunity {
  id: string;
  eventId: string;
  marketId: string;
  outcomeName: string;
  longMarket: PredictionMarket; // Buy "Yes" here (low price)
  shortMarket: PredictionMarket; // Buy "No" here (low price) = equivalent to selling Yes high
  longPrice: number; // Price to buy "Yes" (0-1)
  shortPrice: number; // Price to buy "No" (0-1) -> implied Yes price = 1 - shortPrice
  impliedBuyPrice: number; // Long price
  impliedSellPrice: number; // 1 - shortPrice
  profitPercent: number; // Guaranteed profit %
  profitAmount: number; // On $100 stake
  volumeConstraint: number; // Minimum volume across markets
  detectedAt: string;
  expiresAt?: string;
  isActive: boolean;
  marketData?: {
    event?: PredictionEvent;
    market?: Market;
  };
  // DeepSeek analysis fields
  arbQuality?: 'poor' | 'fair' | 'good' | 'excellent';
  riskFactors?: string[];
  statsAnalyzed?: boolean;
}

export interface LineMovement {
  id: string;
  marketId: string;
  outcomeName: string;
  market: PredictionMarket;
  oldPrice: number;
  newPrice: number;
  percentChange: number;
  timestamp: string;
}

export interface PositiveEVBet {
  id: string;
  marketId: string;
  outcomeName: string;
  market: PredictionMarket;
  marketPrice: number; // Current market price (probability)
  estimatedTrueProb: number; // Your/model estimated probability
  edgePercent: number; // EV edge (market underestimates probability)
  kellyFraction: number; // Kelly criterion bet size
  expectedValue: number; // EV on $100 stake
  confidence?: number; // Model confidence
  detectedAt: string;
}

export interface Alert {
  id: string;
  userId: string;
  alertType: 'arbitrage' | 'line_movement' | 'positive_ev' | 'volume_spike' | 'market_added';
  marketId: string;
  arbitrageId?: string;
  lineMovementId?: string;
  evBetId?: string;
  messageText?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  sentAt?: string;
  readAt?: string;
  isSent: boolean;
  isRead: boolean;
}

export interface UserSettings {
  id: string;
  userId: string;
  minArbitragePercent: number;
  minEVPercent: number;
  maxMarketPrice: number;
  minMarketPrice: number;
  minLiquidity: number;
  minVolume24h: number;
  preferredMarkets: PredictionMarket[];
  excludedMarkets: PredictionMarket[];
  alertsEnabled: boolean;
  alertArbitrage: boolean;
  alertLineMovement: boolean;
  alertPositiveEV: boolean;
  lineMovementThreshold: number; // Alert on X% price change
  quietHoursStart?: string;
  quietHoursEnd?: string;
  alertCooldownMin: number;
  kellyFraction: number; // Default Kelly fraction (0.25 = quarter Kelly)
  notifyTelegram: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// SCRAPER TYPES
// ============================================================================

export interface ScraperConfig {
  name: string;
  baseUrl: string;
  rateLimitMs: number;
  maxRetries: number;
  timeout?: number;
  apiKey?: string;
}

export interface ScrapeResult {
  market: PredictionMarket;
  events: PredictionEvent[];
  markets: Market[];
  oddsSnapshots: OddsSnapshot[];
  errors?: string[];
  scrapedAt: string;
}

// ============================================================================
// BOT TYPES
// ============================================================================

export interface BotCommand {
  command: string;
  description: string;
  handler: (msg: any, match: any) => Promise<void>;
}

export interface AlertPayload {
  alert: Alert;
  event: PredictionEvent;
  market: Market;
  arbitrageOp?: ArbitrageOpportunity;
  lineMovement?: LineMovement;
  evBet?: PositiveEVBet;
}

// ============================================================================
// ARBITRAGE TYPES
// ============================================================================

export interface ArbitrageCalculation {
  buyMarket: PredictionMarket;
  sellMarket: PredictionMarket;
  buyPrice: number;
  sellPrice: number;
  impliedSellPrice: number; // 1 - shortPrice for "No" bets
  profitPercent: number;
  profitAmount: number;
}

export interface CrossMarketMatch {
  eventId: string;
  eventTitle: string;
  question: string;
  markets: {
    market: PredictionMarket;
    marketId: string;
    outcomes: Record<string, number>;
  }[];
  matchedOutcomes: string[];
}

// ============================================================================
// API RESPONSE TYPES (Polymarket, Kalshi)
// ============================================================================

export interface PolymarketEvent {
  id: string;
  title: string;
  description: string;
  slug: string;
  category: string;
  endDate: string;
  imageUrl?: string;
  markets: PolymarketMarket[];
}

export interface PolymarketMarket {
  id: string;
  question: string;
  slug: string;
  outcomePrices: Record<string, string>; // outcome -> price string "0.65"
  liquidity: string;
  volume: string;
  volume24hr: string;
  endDate: string;
  active: boolean;
  closed: boolean;
}

export interface KalshiEvent {
  ticker: string;
  title: string;
  category: string;
  description?: string;
  close_time?: string;
  status: string;
  markets?: KalshiMarket[];
}

export interface KalshiMarket {
  ticker: string;
  event_ticker: string;
  title: string;
  yes_ask: number;
  yes_bid: number;
  no_ask: number;
  no_bid: number;
  volume: number;
  open_interest: number;
  last_price?: number;
  status: string;
}

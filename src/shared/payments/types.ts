/**
 * Payment Module Type Definitions
 */

export type AppId = 
  | 'spreadhunter'
  | 'deckvault'
  | 'packpal'
  | 'dropfarm'
  | 'dropscout'
  | 'launchradar'
  | 'memeradar'
  | 'memestock'
  | 'nftpulse'
  | 'pointtrack'
  | 'rosterradar'
  | 'skinsignal'
  | 'socialindex'
  | 'botindex'
  | 'arbwatch';

export type SubscriptionTier = 'free' | 'starter' | 'basic' | 'pro' | 'elite' | 'enterprise';
export type SubscriptionStatus = 'active' | 'inactive' | 'past_due' | 'canceled' | 'trialing';

export interface TierConfig {
  id: SubscriptionTier;
  name: string;
  price: number;           // in cents
  currency: string;
  interval: 'month' | 'year';
  stripePriceId?: string;  // loaded from env
  features: string[];
  limits: TierLimits;
}

export interface TierLimits {
  requestsPerDay?: number;
  alertsPerDay?: number;
  collections?: number;
  cards?: number;
  exportAllowed?: boolean;
  apiAccess?: boolean;
  [key: string]: any;      // app-specific limits
}

export interface Subscription {
  id: string;
  userId?: string;
  appId: AppId;
  externalUserId: string;      // Telegram ID, Discord ID, etc.
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  grandfathered?: boolean;
  grandfatheredFromTier?: SubscriptionTier;
  grandfatheredGraceEnd?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentEvent {
  id: string;
  appId: AppId;
  eventType: string;
  stripeEventId: string;
  userId?: string;
  externalUserId?: string;
  amount?: number;
  currency?: string;
  tier?: SubscriptionTier;
  metadata?: Record<string, any>;
  createdAt: Date;
}

export interface CheckoutSessionRequest {
  externalUserId: string;
  tier: SubscriptionTier;
  successUrl: string;
  cancelUrl: string;
  email?: string;
  referralCode?: string;
  metadata?: Record<string, any>;
}

export interface ReferralCode {
  id: string;
  appId: AppId;
  externalUserId: string;
  code: string;
  createdAt: Date;
}

export interface ReferralConversion {
  id: string;
  appId: AppId;
  referrerExternalUserId: string;
  referredExternalUserId: string;
  checkoutSessionId?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  status: 'pending' | 'converted' | 'rejected';
  rewardMonths: number;
  payoutCents: number;
  convertedAt?: Date;
  createdAt: Date;
  metadata?: Record<string, any>;
}

export interface ReferralStats {
  appId: AppId;
  externalUserId: string;
  code: string;
  totalReferrals: number;
  convertedReferrals: number;
  pendingReferrals: number;
  totalPayoutCents: number;
  totalRewardMonths: number;
}

export interface CheckoutSessionResponse {
  sessionId: string;
  url: string;
}

export interface PortalSessionRequest {
  externalUserId: string;
  returnUrl: string;
}

export interface SubscriptionStatusResponse {
  appId: AppId;
  externalUserId: string;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  currentPeriodEnd?: Date;
  features: string[];
  limits: TierLimits;
  grandfather?: {
    isGrandfathered: boolean;
    legacyTier?: SubscriptionTier;
    graceEnd?: Date;
    accessUntil?: Date;
  };
}

export interface AppPaymentStats {
  appId: AppId;
  totalUsers: number;
  activeSubscriptions: number;
  mrr: number;                 // in cents
  currency: string;
  byTier: Record<SubscriptionTier, {
    count: number;
    mrr?: number;
    percentage?: number;
  }>;
  recentEvents: PaymentEvent[];
}

export interface MissionControlDashboard {
  timestamp: string;
  apps: AppStatus[];
  portfolioTotal: {
    mrr: number;
    totalSubs: number;
    appsWithRevenue: number;
  };
}

export interface AppStatus {
  id: AppId;
  status: 'healthy' | 'degraded' | 'down';
  stripeConnected: boolean;
  mrr: number;
  activeSubs: number;
  churn30d: number;
  lastEvent?: string;
}

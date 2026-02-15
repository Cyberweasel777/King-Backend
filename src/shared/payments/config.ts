/**
 * Payment Module Configuration
 * Loads environment variables per app
 */

import { AppId, SubscriptionTier, TierConfig } from './types';

// Map of app IDs to their environment variable prefixes
const APP_ENV_PREFIXES: Record<AppId, string> = {
  spreadhunter: 'SPREADHUNTER',
  deckvault: 'DECKVAULT',
  packpal: 'PACKPAL',
  dropfarm: 'DROPFARM',
  dropscout: 'DROPSCOUT',
  launchradar: 'LAUNCHRADAR',
  memeradar: 'MEMERADAR',
  memestock: 'MEMESTOCK',
  nftpulse: 'NFTPULSE',
  pointtrack: 'POINTTRACK',
  rosterradar: 'ROSTERRADAR',
  skinsignal: 'SKINSIGNAL',
  socialindex: 'SOCIALINDEX',
  botindex: 'BOTINDEX',
  arbwatch: 'ARBWATCH',
};

export function getStripeSecretKey(appId: AppId): string | undefined {
  const prefix = APP_ENV_PREFIXES[appId];
  return process.env[`${prefix}_STRIPE_SECRET_KEY`];
}

export function getStripeWebhookSecret(appId: AppId): string | undefined {
  const prefix = APP_ENV_PREFIXES[appId];
  return process.env[`${prefix}_STRIPE_WEBHOOK_SECRET`];
}

export function getStripePriceId(appId: AppId, tier: SubscriptionTier): string | undefined {
  if (tier === 'free') return undefined;
  const prefix = APP_ENV_PREFIXES[appId];
  return process.env[`${prefix}_STRIPE_PRICE_${tier.toUpperCase()}`];
}

export function getMetaCapiAccessToken(appId: AppId): string | undefined {
  const prefix = APP_ENV_PREFIXES[appId];
  return process.env[`${prefix}_META_CAPI_ACCESS_TOKEN`];
}

export function isStripeConfigured(appId: AppId): boolean {
  return !!getStripeSecretKey(appId);
}

export function getAdminUserIds(): string[] {
  const ids = process.env.PAYMENT_ADMIN_IDS || '';
  return ids.split(',').map(id => id.trim()).filter(Boolean);
}

export function isAdmin(externalUserId: string): boolean {
  return getAdminUserIds().includes(externalUserId);
}

// Default tier configurations (apps can override)
export function getDefaultTierConfig(tier: SubscriptionTier): Partial<TierConfig> {
  switch (tier) {
    case 'free':
      return {
        id: 'free',
        name: 'Free',
        price: 0,
        currency: 'usd',
        interval: 'month',
        features: ['Basic access', 'Limited requests'],
        limits: {
          requestsPerDay: 10,
          alertsPerDay: 3,
          exportAllowed: false,
          apiAccess: false,
        },
      };
    case 'basic':
      return {
        id: 'basic',
        name: 'Basic',
        price: 999,  // $9.99
        currency: 'usd',
        interval: 'month',
        features: ['More requests', 'Email alerts', 'Standard support'],
        limits: {
          requestsPerDay: 100,
          alertsPerDay: 20,
          exportAllowed: false,
          apiAccess: false,
        },
      };
    case 'pro':
      return {
        id: 'pro',
        name: 'Pro',
        price: 2999,  // $29.99
        currency: 'usd',
        interval: 'month',
        features: ['Unlimited requests', 'Priority alerts', 'Data export', 'API access', 'Priority support'],
        limits: {
          requestsPerDay: Infinity,
          alertsPerDay: Infinity,
          exportAllowed: true,
          apiAccess: true,
        },
      };
    case 'enterprise':
      return {
        id: 'enterprise',
        name: 'Enterprise',
        price: 9999,  // $99.99
        currency: 'usd',
        interval: 'month',
        features: ['Custom limits', 'Dedicated support', 'SLA', 'Custom integrations'],
        limits: {
          requestsPerDay: Infinity,
          alertsPerDay: Infinity,
          exportAllowed: true,
          apiAccess: true,
        },
      };
    default:
      return getDefaultTierConfig('free');
  }
}

// App-specific tier configs can be defined here
export const APP_TIER_CONFIGS: Partial<Record<AppId, Record<SubscriptionTier, Partial<TierConfig>>>> = {
  // Example: deckvault has different limits
  // deckvault: {
  //   free: { ...getDefaultTierConfig('free'), limits: { collections: 1, cards: 100 } },
  //   basic: { ...getDefaultTierConfig('basic'), limits: { collections: 5, cards: 1000 } },
  //   pro: { ...getDefaultTierConfig('pro'), limits: { collections: Infinity, cards: Infinity } },
  // },
};

export function getTierConfig(appId: AppId, tier: SubscriptionTier): TierConfig {
  const defaults = getDefaultTierConfig(tier);
  const overrides = APP_TIER_CONFIGS[appId]?.[tier] || {};
  const stripePriceId = getStripePriceId(appId, tier);
  
  return {
    ...defaults,
    ...overrides,
    id: tier,
    stripePriceId,
  } as TierConfig;
}

export function getAvailableTiers(appId: AppId): TierConfig[] {
  const tiers: SubscriptionTier[] = ['free', 'basic', 'pro'];
  return tiers.map(tier => getTierConfig(appId, tier));
}

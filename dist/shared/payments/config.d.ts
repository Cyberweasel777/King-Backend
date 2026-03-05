/**
 * Payment Module Configuration
 * Loads environment variables per app
 */
import { AppId, SubscriptionTier, TierConfig } from './types';
export declare function getStripeSecretKey(appId: AppId): string | undefined;
export declare function getStripeWebhookSecret(appId: AppId): string | undefined;
export declare function getStripePriceId(appId: AppId, tier: SubscriptionTier): string | undefined;
export declare function getMetaCapiAccessToken(appId: AppId): string | undefined;
export declare function isStripeConfigured(appId: AppId): boolean;
export declare function getAdminUserIds(): string[];
export declare function isAdmin(externalUserId: string): boolean;
export declare function getDefaultTierConfig(tier: SubscriptionTier): Partial<TierConfig>;
export declare const APP_TIER_CONFIGS: Partial<Record<AppId, Partial<Record<SubscriptionTier, Partial<TierConfig>>>>>;
export declare function getTierConfig(appId: AppId, tier: SubscriptionTier): TierConfig;
export declare function getAvailableTiers(appId: AppId): TierConfig[];
//# sourceMappingURL=config.d.ts.map
/**
 * Access Control Module
 * Subscription checking and gating for bot commands
 */
import { Context } from 'telegraf';
import { AppId, SubscriptionTier, TierConfig, SubscriptionStatusResponse } from './types';
/**
 * Check if user has an active subscription at or above the required tier
 */
export declare function isSubscribed(appId: AppId, externalUserId: string, minimumTier?: SubscriptionTier): Promise<boolean>;
/**
 * Get user's subscription status with full details
 */
export declare function getSubscriptionStatus(appId: AppId, externalUserId: string): Promise<SubscriptionStatusResponse>;
/**
 * Get user's tier level
 */
export declare function getUserTier(appId: AppId, externalUserId: string): Promise<SubscriptionTier>;
/**
 * Check if user is within their usage limits
 */
export declare function checkLimit(appId: AppId, externalUserId: string, limitName: keyof TierConfig['limits'], currentUsage: number): Promise<{
    allowed: boolean;
    limit: number;
    remaining: number;
}>;
/**
 * Telegram bot middleware: Require subscription
 * Usage: bot.command('premium', withSubscription('appId', 'pro'), handler)
 */
export declare function withSubscription(appId: AppId, minimumTier?: SubscriptionTier): (ctx: Context, next: () => Promise<void>) => Promise<void>;
/**
 * Get tier comparison for display
 */
export declare function getTierComparison(appId: AppId): string;
/**
 * Format subscription status for display
 */
export declare function formatSubscriptionStatus(status: SubscriptionStatusResponse): string;
//# sourceMappingURL=access-control.d.ts.map
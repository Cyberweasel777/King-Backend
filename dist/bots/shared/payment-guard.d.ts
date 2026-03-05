/**
 * Bot Payment Guard Middleware
 * Telegram/Discord bot subscription checking
 */
import { Context } from 'telegraf';
import { AppId } from '../../shared/payments/types';
/**
 * Middleware: Require subscription tier
 * Usage: bot.command('premium', withSubscription('appId', 'pro'), handler)
 */
export declare function withSubscription(appId: AppId, minimumTier?: 'free' | 'basic' | 'pro' | 'enterprise'): (ctx: Context, next: () => Promise<void>) => Promise<void>;
/**
 * Check subscription without middleware (for inline checks)
 */
export declare function checkSubscription(appId: AppId, ctx: Context, minimumTier?: 'free' | 'basic' | 'pro' | 'enterprise'): Promise<boolean>;
/**
 * Command handler: /status
 * Show user's current subscription status
 */
export declare function createStatusCommand(appId: AppId): (ctx: Context) => Promise<void>;
/**
 * Command handler: /pricing
 * Show pricing tiers
 */
export declare function createPricingCommand(appId: AppId): (ctx: Context) => Promise<void>;
/**
 * Command handler: /subscribe
 * Direct link to checkout
 */
export declare function createSubscribeCommand(appId: AppId): (ctx: Context) => Promise<void>;
//# sourceMappingURL=payment-guard.d.ts.map
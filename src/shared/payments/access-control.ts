/**
 * Access Control Module
 * Subscription checking and gating for bot commands
 */

import { Context } from 'telegraf';
import { AppId, SubscriptionTier, TierConfig, SubscriptionStatusResponse } from './types';
import { getSubscription, getOrCreateSubscription, upsertSubscription } from './database';
import { getTierConfig, getAvailableTiers } from './config';
import { getEffectiveSubscription } from './arbwatch-migration';

const TIER_HIERARCHY: SubscriptionTier[] = ['free', 'starter', 'basic', 'pro', 'elite', 'enterprise'];

/**
 * Check if user has an active subscription at or above the required tier
 */
export async function isSubscribed(
  appId: AppId,
  externalUserId: string,
  minimumTier: SubscriptionTier = 'basic'
): Promise<boolean> {
  const subscription = await getSubscription(appId, externalUserId);
  
  if (!subscription) {
    return minimumTier === 'free';
  }

  // Check status
  if (subscription.status !== 'active' && subscription.status !== 'trialing') {
    return minimumTier === 'free';
  }

  const effective = appId === 'arbwatch'
    ? getEffectiveSubscription(subscription)
    : {
        effectiveTier: subscription.tier,
        inGrandfatherGrace: false,
        shouldAutoMigrate: false,
        mappedTier: subscription.tier,
      };

  if (appId === 'arbwatch' && effective.shouldAutoMigrate) {
    await upsertSubscription(appId, externalUserId, {
      tier: effective.mappedTier,
      grandfathered: false,
      grandfatheredFromTier: undefined,
      grandfatheredGraceEnd: undefined,
    });
  }

  // Check tier hierarchy
  const userTierIndex = TIER_HIERARCHY.indexOf(effective.effectiveTier);
  const requiredTierIndex = TIER_HIERARCHY.indexOf(minimumTier);

  return userTierIndex >= requiredTierIndex;
}

/**
 * Get user's subscription status with full details
 */
export async function getSubscriptionStatus(
  appId: AppId,
  externalUserId: string
): Promise<SubscriptionStatusResponse> {
  const subscription = await getOrCreateSubscription(appId, externalUserId);
  const effective = appId === 'arbwatch'
    ? getEffectiveSubscription(subscription)
    : {
        effectiveTier: subscription.tier,
        inGrandfatherGrace: false,
        shouldAutoMigrate: false,
        mappedTier: subscription.tier,
      };
  const tierConfig = getTierConfig(appId, effective.effectiveTier);

  return {
    appId,
    externalUserId,
    tier: effective.effectiveTier,
    status: subscription.status,
    currentPeriodEnd: subscription.currentPeriodEnd,
    features: tierConfig.features,
    limits: tierConfig.limits,
    grandfather: {
      isGrandfathered: Boolean(subscription.grandfathered),
      legacyTier: subscription.grandfatheredFromTier,
      graceEnd: subscription.grandfatheredGraceEnd,
      accessUntil: subscription.grandfatheredGraceEnd,
    },
  };
}

/**
 * Get user's tier level
 */
export async function getUserTier(
  appId: AppId,
  externalUserId: string
): Promise<SubscriptionTier> {
  const subscription = await getSubscription(appId, externalUserId);
  if (!subscription) return 'free';
  if (appId !== 'arbwatch') return subscription.tier;
  return getEffectiveSubscription(subscription).effectiveTier;
}

/**
 * Check if user is within their usage limits
 */
export async function checkLimit(
  appId: AppId,
  externalUserId: string,
  limitName: keyof TierConfig['limits'],
  currentUsage: number
): Promise<{ allowed: boolean; limit: number; remaining: number }> {
  const subscription = await getOrCreateSubscription(appId, externalUserId);
  const tierConfig = getTierConfig(appId, subscription.tier);
  const limit = tierConfig.limits[limitName];

  if (limit === undefined) {
    return { allowed: true, limit: Infinity, remaining: Infinity };
  }

  if (limit === Infinity) {
    return { allowed: true, limit: Infinity, remaining: Infinity };
  }

  const remaining = (limit as number) - currentUsage;
  return {
    allowed: remaining > 0,
    limit: limit as number,
    remaining: Math.max(0, remaining),
  };
}

/**
 * Telegram bot middleware: Require subscription
 * Usage: bot.command('premium', withSubscription('appId', 'pro'), handler)
 */
export function withSubscription(
  appId: AppId,
  minimumTier: SubscriptionTier = 'basic'
) {
  return async (ctx: Context, next: () => Promise<void>): Promise<void> => {
    const externalUserId = ctx.from?.id.toString();
    
    if (!externalUserId) {
      await ctx.reply('Unable to identify user. Please try again.');
      return;
    }

    const hasAccess = await isSubscribed(appId, externalUserId, minimumTier);
    
    if (!hasAccess) {
      await sendUpgradePrompt(ctx, appId, minimumTier);
      return;
    }

    await next();
  };
}

/**
 * Send upgrade prompt to user
 */
async function sendUpgradePrompt(
  ctx: Context,
  appId: AppId,
  requiredTier: SubscriptionTier
): Promise<void> {
  const tiers = getAvailableTiers(appId);
  const userId = ctx.from?.id.toString() || '';
  
  // Build upgrade message
  let message = `🔒 *Premium Feature*\n\n`;
  message += `This command requires the *${requiredTier}* tier or higher.\n\n`;
  message += `*Available Plans:*\n`;
  
  for (const tier of tiers) {
    if (tier.id === 'free') continue;
    const price = (tier.price / 100).toFixed(2);
    message += `\n*${tier.name}* - $${price}/${tier.interval}\n`;
    message += tier.features.slice(0, 2).map(f => `  ✓ ${f}`).join('\n');
    message += '\n';
  }
  
  message += `\n[Upgrade Now](https://your-domain.com/payments/${appId}/checkout?user=${userId})`;

  await ctx.reply(message, {
    parse_mode: 'Markdown',
    link_preview_options: { is_disabled: true },
  });
}

/**
 * Get tier comparison for display
 */
export function getTierComparison(appId: AppId): string {
  const tiers = getAvailableTiers(appId);
  
  let message = '*Pricing & Features*\n\n';
  
  for (const tier of tiers) {
    const price = tier.price === 0 ? 'Free' : `$${(tier.price / 100).toFixed(2)}/${tier.interval}`;
    message += `*${tier.name}* - ${price}\n`;
    message += tier.features.map(f => `  • ${f}`).join('\n');
    message += '\n\n';
  }
  
  return message;
}

/**
 * Format subscription status for display
 */
export function formatSubscriptionStatus(status: SubscriptionStatusResponse): string {
  const tierEmoji: Record<SubscriptionTier, string> = {
    free: '🆓',
    starter: '⭐',
    basic: '⭐',
    pro: '💎',
    elite: '👑',
    enterprise: '🏢',
  };

  let message = `${tierEmoji[status.tier]} *${status.tier.toUpperCase()} Plan*\n`;
  message += `Status: ${status.status}\n`;
  
  if (status.currentPeriodEnd) {
    const daysLeft = Math.ceil((status.currentPeriodEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    message += `Renews in: ${daysLeft} days\n`;
  }

  if (status.grandfather?.isGrandfathered && status.grandfather.graceEnd) {
    const graceDaysLeft = Math.max(0, Math.ceil((status.grandfather.graceEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
    message += `Grandfathered grace: ${graceDaysLeft} days left\n`;
  }

  message += `\n*Your Features:*\n`;
  message += status.features.map(f => `  ✓ ${f}`).join('\n');
  
  return message;
}

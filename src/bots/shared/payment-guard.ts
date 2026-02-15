/**
 * Bot Payment Guard Middleware
 * Telegram/Discord bot subscription checking
 */

import { Context } from 'telegraf';
import { AppId } from '../../shared/payments/types';
import {
  isSubscribed,
  getSubscriptionStatus,
  getTierComparison,
  formatSubscriptionStatus,
} from '../../shared/payments';
import { getAvailableTiers } from '../../shared/payments/config';

/**
 * Middleware: Require subscription tier
 * Usage: bot.command('premium', withSubscription('appId', 'pro'), handler)
 */
export function withSubscription(
  appId: AppId,
  minimumTier: 'free' | 'basic' | 'pro' | 'enterprise' = 'basic'
) {
  return async (ctx: Context, next: () => Promise<void>): Promise<void> => {
    const externalUserId = ctx.from?.id.toString();
    
    if (!externalUserId) {
      await ctx.reply('❌ Unable to identify user.');
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
 * Check subscription without middleware (for inline checks)
 */
export async function checkSubscription(
  appId: AppId,
  ctx: Context,
  minimumTier: 'free' | 'basic' | 'pro' | 'enterprise' = 'basic'
): Promise<boolean> {
  const externalUserId = ctx.from?.id.toString();
  if (!externalUserId) return false;
  
  return isSubscribed(appId, externalUserId, minimumTier);
}

/**
 * Send upgrade prompt with payment link
 */
async function sendUpgradePrompt(
  ctx: Context,
  appId: AppId,
  requiredTier: string
): Promise<void> {
  const userId = ctx.from?.id.toString() || '';
  const tiers = getAvailableTiers(appId);
  
  let message = `🔒 *Premium Feature Required*\n\n`;
  message += `This command requires the *${requiredTier.toUpperCase()}* tier or higher.\n\n`;
  message += `*Choose a plan:*\n\n`;
  
  for (const tier of tiers) {
    if (tier.id === 'free') continue;
    const price = tier.price === 0 ? 'Free' : `$${(tier.price / 100).toFixed(2)}/${tier.interval}`;
    message += `*${tier.name}* - ${price}\n`;
    message += tier.features.slice(0, 3).map(f => `  ✓ ${f}`).join('\n');
    message += '\n\n';
  }
  
  // TODO: Replace with actual checkout URL
  const checkoutUrl = `${process.env.API_BASE_URL}/payments/${appId}/checkout?user=${userId}`;
  
  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '💳 Upgrade Now', url: checkoutUrl }],
        [{ text: '📋 View All Plans', callback_data: `pricing_${appId}` }],
      ],
    },
  });
}

/**
 * Command handler: /status
 * Show user's current subscription status
 */
export function createStatusCommand(appId: AppId) {
  return async (ctx: Context): Promise<void> => {
    const externalUserId = ctx.from?.id.toString();
    if (!externalUserId) {
      await ctx.reply('❌ Unable to identify user.');
      return;
    }
    
    try {
      const status = await getSubscriptionStatus(appId, externalUserId);
      const message = formatSubscriptionStatus(status);
      
      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (err: any) {
      await ctx.reply(`❌ Error: ${err.message}`);
    }
  };
}

/**
 * Command handler: /pricing
 * Show pricing tiers
 */
export function createPricingCommand(appId: AppId) {
  return async (ctx: Context): Promise<void> => {
    const message = getTierComparison(appId);
    const userId = ctx.from?.id.toString() || '';
    const checkoutUrl = `${process.env.API_BASE_URL}/payments/${appId}/checkout?user=${userId}`;
    
    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '💳 Get Started', url: checkoutUrl }],
        ],
      },
    });
  };
}

/**
 * Command handler: /subscribe
 * Direct link to checkout
 */
export function createSubscribeCommand(appId: AppId) {
  return async (ctx: Context): Promise<void> => {
    const userId = ctx.from?.id.toString() || '';
    const checkoutUrl = `${process.env.API_BASE_URL}/payments/${appId}/checkout?user=${userId}`;
    
    await ctx.reply(
      'Ready to upgrade? Click below to choose your plan:',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '💳 Choose Plan', url: checkoutUrl }],
          ],
        },
      }
    );
  };
}

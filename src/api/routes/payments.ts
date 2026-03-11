/**
 * Payment Routes
 * Express router for payment endpoints per app
 * Mounted at /api/:app/payments
 */

import { Router, Request, Response } from 'express';
import { AppId } from '../../shared/payments/types';
import {
  isSubscribed,
  getSubscriptionStatus,
  getTierComparison,
  formatSubscriptionStatus,
} from '../../shared/payments/access-control';
import {
  createCheckoutSession,
  createPortalSession,
} from '../../shared/payments/stripe-client';
import {
  verifyWebhookPayload,
  handleWebhookEvent,
} from '../../shared/payments/webhook-handler';
import {
  getAppPaymentStats,
  getRecentPaymentEvents,
  grantSubscription,
  revokeSubscription,
  getOrCreateReferralCode,
  getReferralStats,
  resolveReferralCode,
} from '../../shared/payments/database';
import {
  getAvailableTiers,
  isStripeConfigured,
  isAdmin,
} from '../../shared/payments/config';

const router = Router();

// Middleware to extract app ID from params
const extractAppId = (req: Request, res: Response, next: Function) => {
  const appId = req.params.app as AppId;
  const validApps: AppId[] = [
    'spreadhunter', 'deckvault', 'packpal', 'dropfarm', 'dropscout',
    'launchradar', 'memeradar', 'memestock', 'nftpulse', 'pointtrack',
    'rosterradar', 'skinsignal', 'socialindex', 'botindex', 'arbwatch',
    'baseradar'
  ];
  
  if (!validApps.includes(appId)) {
    return res.status(400).json({ error: 'Invalid app ID' });
  }
  
  (req as any).appId = appId;
  next();
};

/**
 * GET /api/:app/payments/config
 * Get available tiers and pricing
 */
router.get('/:app/payments/config', extractAppId, async (req, res) => {
  const appId = (req as any).appId as AppId;
  
  try {
    const tiers = getAvailableTiers(appId);
    
    res.json({
      app: appId,
      stripeConfigured: isStripeConfigured(appId),
      tiers: tiers.map(t => ({
        id: t.id,
        name: t.name,
        price: t.price,
        currency: t.currency,
        interval: t.interval,
        features: t.features,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/:app/payments/status
 * Get current user's subscription status
 */
router.get('/:app/payments/status', extractAppId, async (req, res) => {
  const appId = (req as any).appId as AppId;
  const externalUserId = req.query.userId as string;
  
  if (!externalUserId) {
    return res.status(400).json({ error: 'Missing userId parameter' });
  }
  
  try {
    const status = await getSubscriptionStatus(appId, externalUserId);
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/:app/payments/referral/code
 * Get or create referral code for user
 */
router.get('/:app/payments/referral/code', extractAppId, async (req, res) => {
  const appId = (req as any).appId as AppId;
  const externalUserId = req.query.userId as string;

  if (!externalUserId) {
    return res.status(400).json({ error: 'Missing userId parameter' });
  }

  try {
    const referral = await getOrCreateReferralCode(appId, externalUserId);
    res.json({
      app: appId,
      externalUserId,
      code: referral.code,
      shareText: `Use my code ${referral.code} at checkout`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/:app/payments/referral/stats
 * Get referral conversion stats for user
 */
router.get('/:app/payments/referral/stats', extractAppId, async (req, res) => {
  const appId = (req as any).appId as AppId;
  const externalUserId = req.query.userId as string;

  if (!externalUserId) {
    return res.status(400).json({ error: 'Missing userId parameter' });
  }

  try {
    const stats = await getReferralStats(appId, externalUserId);
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/:app/payments/referral/validate
 * Validate a referral code
 */
router.get('/:app/payments/referral/validate', extractAppId, async (req, res) => {
  const appId = (req as any).appId as AppId;
  const code = (req.query.code as string || '').trim();

  if (!code) {
    return res.status(400).json({ error: 'Missing code parameter' });
  }

  try {
    const referral = await resolveReferralCode(appId, code);
    res.json({ valid: !!referral });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/:app/payments/checkout
 * Create checkout session
 */
router.post('/:app/payments/checkout', extractAppId, async (req, res) => {
  const appId = (req as any).appId as AppId;
  const { externalUserId, tier, successUrl, cancelUrl, email, referralCode } = req.body;
  
  if (!externalUserId || !tier || !successUrl || !cancelUrl) {
    return res.status(400).json({ 
      error: 'Missing required fields: externalUserId, tier, successUrl, cancelUrl' 
    });
  }
  
  try {
    const session = await createCheckoutSession(appId, {
      externalUserId,
      tier,
      successUrl,
      cancelUrl,
      email,
      referralCode,
    });
    
    res.json(session);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/:app/payments/portal
 * Create customer portal session
 */
router.post('/:app/payments/portal', extractAppId, async (req, res) => {
  const appId = (req as any).appId as AppId;
  const { externalUserId, returnUrl } = req.body;
  
  if (!externalUserId || !returnUrl) {
    return res.status(400).json({ error: 'Missing externalUserId or returnUrl' });
  }
  
  try {
    const url = await createPortalSession(appId, {
      externalUserId,
      returnUrl,
    });
    
    res.json({ url });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/:app/payments/webhook
 * Stripe webhook handler
 */
router.post('/:app/payments/webhook', extractAppId, async (req, res) => {
  const appId = (req as any).appId as AppId;
  const signature = req.headers['stripe-signature'] as string;
  
  if (!signature) {
    return res.status(400).json({ error: 'Missing stripe-signature header' });
  }
  
  // Get raw body for signature verification
  const payload = req.body;
  
  const event = verifyWebhookPayload(appId, payload, signature);
  
  if (!event) {
    return res.status(400).json({ error: 'Invalid signature' });
  }
  
  try {
    const result = await handleWebhookEvent(appId, event);
    res.json(result);
  } catch (err: any) {
    console.error(`Webhook error for ${appId}:`, err);
    // Still return 200 to prevent Stripe retries
    res.json({ processed: false, message: err.message });
  }
});

/**
 * GET /api/:app/payments/admin/stats
 * Admin: Get payment stats
 */
router.get('/:app/payments/admin/stats', extractAppId, async (req, res) => {
  const appId = (req as any).appId as AppId;
  const adminUserId = req.query.adminId as string;
  const days = parseInt(req.query.days as string) || 30;
  
  if (!isAdmin(adminUserId)) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  
  try {
    const stats = await getAppPaymentStats(appId, days);
    const recentEvents = await getRecentPaymentEvents(appId, 10);
    
    // Calculate percentages
    const byTierWithPct: any = {};
    for (const [tier, count] of Object.entries(stats.byTier)) {
      byTierWithPct[tier] = {
        count,
        percentage: stats.totalUsers > 0 ? (count / stats.totalUsers) * 100 : 0,
      };
    }
    
    res.json({
      app: appId,
      period: `${days}d`,
      summary: {
        totalUsers: stats.totalUsers,
        activeSubscriptions: stats.activeSubscriptions,
        mrr: stats.mrr,
        currency: 'usd',
      },
      byTier: byTierWithPct,
      recentEvents,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/:app/payments/admin/grant
 * Admin: Grant subscription manually
 */
router.post('/:app/payments/admin/grant', extractAppId, async (req, res) => {
  const appId = (req as any).appId as AppId;
  const { adminId, externalUserId, tier, durationDays } = req.body;
  
  if (!isAdmin(adminId)) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  
  try {
    const subscription = await grantSubscription(
      appId, 
      externalUserId, 
      tier, 
      durationDays || 30
    );
    
    res.json({
      success: true,
      subscription: {
        appId: subscription.appId,
        externalUserId: subscription.externalUserId,
        tier: subscription.tier,
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/:app/payments/admin/revoke
 * Admin: Revoke subscription
 */
router.post('/:app/payments/admin/revoke', extractAppId, async (req, res) => {
  const appId = (req as any).appId as AppId;
  const { adminId, externalUserId } = req.body;
  
  if (!isAdmin(adminId)) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  
  try {
    const subscription = await revokeSubscription(appId, externalUserId);
    
    res.json({
      success: true,
      subscription: {
        appId: subscription.appId,
        externalUserId: subscription.externalUserId,
        tier: subscription.tier,
        status: subscription.status,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

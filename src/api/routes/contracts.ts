import { Router } from 'express';

const router = Router();

const GENERATED_AT = '2026-02-18T08:17:00-05:00';

const paymentRailsContract = {
  generatedAt: GENERATED_AT,
  source: {
    deepseekViability: 'intel/outputs/2026-02-18/deepseek-ai-payment-rails-viability.json',
    githubIdeas: 'intel/outputs/2026-02-18/github-ai-payment-rails-ideas.json',
    rolloutDoc: 'docs/ai-payment-rails-rollout.md',
  },
  p1ToP5: [
    {
      id: 'P1',
      featureId: 'F3',
      appId: 'spreadhunter',
      name: 'Prediction Market Signal Paywall',
      priorityRank: 1,
      checkoutPath: '/api/spreadhunter/payments/checkout',
      statusPath: '/api/spreadhunter/payments/status',
      configPath: '/api/spreadhunter/payments/config',
      defaultTier: 'basic',
    },
    {
      id: 'P2',
      featureId: 'F2',
      appId: 'botindex',
      name: 'Stripe Connect Revenue Share for Bot Listings',
      priorityRank: 2,
      checkoutPath: '/api/botindex/payments/checkout',
      statusPath: '/api/botindex/payments/status',
      configPath: '/api/botindex/payments/config',
      defaultTier: 'pro',
      note: 'Connect onboarding rollout remains flag-gated; current contract is additive.',
    },
    {
      id: 'P3',
      featureId: 'F6',
      appId: 'memeradar',
      name: 'Creator Token Launch Fee',
      priorityRank: 3,
      checkoutPath: '/api/memeradar/payments/checkout',
      statusPath: '/api/memeradar/payments/status',
      configPath: '/api/memeradar/payments/config',
      defaultTier: 'pro',
    },
    {
      id: 'P4',
      featureId: 'F5',
      appId: 'rosterradar',
      name: 'Sports Betting Signal Subscription + Affiliate',
      priorityRank: 4,
      checkoutPath: '/api/rosterradar/payments/checkout',
      statusPath: '/api/rosterradar/payments/status',
      configPath: '/api/rosterradar/payments/config',
      defaultTier: 'basic',
    },
    {
      id: 'P5',
      featureId: 'F8',
      appId: 'botindex',
      name: 'Cross-App Signal Vault Bundle (BotIndex Anchor)',
      priorityRank: 5,
      checkoutPath: '/api/payments/checkout?app=botindex&tier=pro',
      statusPath: '/api/botindex/payments/status',
      configPath: '/api/botindex/payments/config',
      defaultTier: 'pro',
      note: 'Bundle entitlement maps to per-app checks; phased rollout required.',
    },
  ],
  uiShells: {
    landing: {
      repoPath: 'engdiv-landing',
      envVar: 'NEXT_PUBLIC_KING_BACKEND_BASE_URL',
      discoveryPath: '/api/contracts/payment-rails',
    },
    dashboard: {
      repoPath: 'dashboard',
      envVar: 'KING_BACKEND_BASE_URL',
      discoveryPath: '/api/contracts/payment-rails/ui-shells',
    },
    backendShell: {
      repoPath: 'king-backend',
      routesMountedUnder: '/api',
    },
  },
  defaults: {
    additiveOnly: true,
    defaultEnabled: false,
    safeRollout: true,
  },
};

router.get('/payment-rails', (_req, res) => {
  res.json(paymentRailsContract);
});

router.get('/payment-rails/ui-shells', (_req, res) => {
  res.json({
    generatedAt: GENERATED_AT,
    shells: paymentRailsContract.uiShells,
    routes: paymentRailsContract.p1ToP5.map((item) => ({
      id: item.id,
      appId: item.appId,
      checkoutPath: item.checkoutPath,
      statusPath: item.statusPath,
      configPath: item.configPath,
    })),
  });
});

export default router;

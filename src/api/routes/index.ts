/**
 * API Routes Registry
 * Mounts all canary app routes
 */

import { Router } from 'express';

// Import canary app routes
import botindexRouter from './botindex';
import botindexSportsRouter from './botindex-sports';
import botindexCryptoRouter from './botindex-crypto';
import botindexGenesisRouter from './botindex-genesis';
import botindexCommerceRouter from './botindex-commerce';
import botindexZoraRouter from './botindex-zora';
import botindexHyperliquidRouter from './botindex-hyperliquid';
import botindexAliasesRouter from './botindex-aliases';
import botindexSocialRouter from './botindex-social';
import botindexDopplerRouter from './botindex-doppler';
import botindexHip6Router from './botindex-hip6';
import botindexHip4Router from './botindex-hip4';
import botindexTrustRouter from './botindex-trust';
import x402TestRouter from './x402-test';
import x402PremiumRouter from './x402-premium';
import memeradarRouter from './memeradar';
import arbwatchRouter from './arbwatch';
import skinsignalRouter from './skinsignal';
import paymentsGlobalRouter from './payments-global';
import paymentsRouter from './payments';
import contractsRouter from './contracts';
import shellRouter from './shell';
import signalsRouter from './signals';
import arbRouter from './arb';
import botindexKeysRouter from './botindex-keys';
import adminDashboardRouter from './admin-dashboard';
import botindexBeaconRouter from './botindex-beacon';
import { optionalApiKey } from '../middleware/apiKeyAuth';

const router = Router();

// Global optional API key auth so paid subscribers bypass x402 pay-per-call gates.
router.use(optionalApiKey, (req, _res, next) => {
  if (req.apiKeyAuth) {
    (req as any).__apiKeyAuthenticated = true;
    (req as any).__freeTrialAuthenticated = true;
    (req as any).__billingMode = 'subscription';
  }
  next();
});

router.use('/botindex/keys', botindexKeysRouter);

// Domain-centric BotIndex routes (canonical)
router.use('/botindex', botindexZoraRouter);
router.use('/botindex', botindexHyperliquidRouter);
router.use('/botindex', botindexSportsRouter);
router.use('/botindex', botindexCryptoRouter);
router.use('/botindex', botindexDopplerRouter);
router.use('/botindex', botindexHip6Router);
router.use('/botindex', botindexHip4Router);
router.use('/botindex', botindexTrustRouter);
router.use('/botindex', botindexCommerceRouter);
router.use('/botindex/genesis', botindexGenesisRouter);
router.use('/botindex/signals', signalsRouter);
router.use('/botindex/signals/premium', x402PremiumRouter);
router.use('/botindex/signals/x402', x402TestRouter);
router.use('/botindex/crypto/meme-signals', memeradarRouter);
router.use('/botindex/sports/arbitrage', arbwatchRouter);
router.use('/botindex/sports/arbitrage', arbRouter);
router.use('/botindex/commerce/price-tracking', skinsignalRouter);

// Top-level branded aliases (discoverable names)
router.use('/botindex', botindexAliasesRouter);

// Social sentiment pipeline
router.use('/botindex', botindexSocialRouter);

// Legacy BotIndex + v1/x402 aliases
router.use('/botindex', botindexRouter);

// Legacy app-centric aliases (backward compatibility)
router.use('/memeradar', memeradarRouter);
router.use('/arbwatch', arbwatchRouter);
router.use('/skinsignal', skinsignalRouter);
router.use('/signals', signalsRouter);
router.use('/arb', arbRouter);

// App-scoped payment routes (config/status/checkout/portal/webhook/admin)
router.use('/', paymentsRouter);

// Global payments helper routes
router.use('/payments', paymentsGlobalRouter);

// Cross-repo route contracts for UI shells
router.use('/contracts', contractsRouter);

// Shell endpoints for landing/dashboard rollouts
router.use('/', shellRouter);

// Admin dashboard (traffic, conversions, funnel)
router.use('/admin/dashboard', adminDashboardRouter);

// Landing page beacon tracking (pixel)
router.use('/', botindexBeaconRouter);

// TODO: Add remaining 12 apps here
// router.use('/spreadhunter', spreadhunterRouter);
// router.use('/deckvault', deckvaultRouter);
// etc.

export default router;

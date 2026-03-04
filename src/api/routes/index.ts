/**
 * API Routes Registry
 * Mounts all canary app routes
 */

import { Router } from 'express';

// Import canary app routes
import botindexRouter from './botindex';
import botindexZoraRouter from './botindex-zora';
import botindexHyperliquidRouter from './botindex-hyperliquid';
import memeradarRouter from './memeradar';
import arbwatchRouter from './arbwatch';
import skinsignalRouter from './skinsignal';
import paymentsGlobalRouter from './payments-global';
import paymentsRouter from './payments';
import contractsRouter from './contracts';
import shellRouter from './shell';
import signalsRouter from './signals';
import arbRouter from './arb';

const router = Router();

// Mount canary routes
router.use('/botindex', botindexZoraRouter);
router.use('/botindex', botindexHyperliquidRouter);
router.use('/botindex', botindexRouter);
router.use('/memeradar', memeradarRouter);
router.use('/arbwatch', arbwatchRouter);
router.use('/skinsignal', skinsignalRouter);

// App-scoped payment routes (config/status/checkout/portal/webhook/admin)
router.use('/', paymentsRouter);

// Global payments helper routes
router.use('/payments', paymentsGlobalRouter);

// Cross-repo route contracts for UI shells
router.use('/contracts', contractsRouter);

// Shell endpoints for landing/dashboard rollouts
router.use('/', shellRouter);

// Shared signal bus routes (fan-out across apps)
router.use('/signals', signalsRouter);

// Cross-platform arb scanner endpoint
router.use('/arb', arbRouter);

// TODO: Add remaining 12 apps here
// router.use('/spreadhunter', spreadhunterRouter);
// router.use('/deckvault', deckvaultRouter);
// etc.

export default router;

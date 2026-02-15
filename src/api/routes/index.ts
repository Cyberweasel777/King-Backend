/**
 * API Routes Registry
 * Mounts all canary app routes
 */

import { Router } from 'express';

// Import canary app routes
import botindexRouter from './botindex';
import memeradarRouter from './memeradar';
import arbwatchRouter from './arbwatch';

const router = Router();

// Mount canary routes
router.use('/botindex', botindexRouter);
router.use('/memeradar', memeradarRouter);
router.use('/arbwatch', arbwatchRouter);

// TODO: Add remaining 12 apps here
// router.use('/spreadhunter', spreadhunterRouter);
// router.use('/deckvault', deckvaultRouter);
// etc.

export default router;

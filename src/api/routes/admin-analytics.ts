/**
 * Admin Analytics Routes — Convex-powered persistent analytics.
 * 
 * All routes require ?adminId=8063432083
 */

import { Router, Request, Response } from 'express';
import logger from '../../config/logger';
import { getOptionalConvexAnalyticsStore } from '../../shared/analytics/convex-client';

const router = Router();
const ADMIN_ID = process.env.ADMIN_ID || '8063432083';

function checkAdmin(req: Request, res: Response): boolean {
  const adminId = typeof req.query.adminId === 'string' ? req.query.adminId : '';
  if (adminId !== ADMIN_ID) {
    res.status(403).json({ error: 'access_denied' });
    return false;
  }
  return true;
}

function getStore(res: Response) {
  const store = getOptionalConvexAnalyticsStore();
  if (!store) {
    res.status(503).json({ error: 'convex_not_configured', message: 'Set CONVEX_URL and CONVEX_ADMIN_KEY' });
    return null;
  }
  return store;
}

// GET /admin/analytics — full analytics summary
router.get('/analytics', async (req: Request, res: Response) => {
  if (!checkAdmin(req, res)) return;
  const store = getStore(res);
  if (!store) return;

  try {
    const sinceStr = typeof req.query.since === 'string' ? req.query.since : '';
    const bucketStr = typeof req.query.bucket === 'string' ? req.query.bucket : '';

    const sinceTimestamp = sinceStr ? new Date(sinceStr).getTime() : undefined;
    const bucketMs = bucketStr ? parseInt(bucketStr, 10) : undefined;

    const data = await store.getAnalytics({
      sinceTimestamp: sinceTimestamp && !isNaN(sinceTimestamp) ? sinceTimestamp : undefined,
      bucketMs: bucketMs && !isNaN(bucketMs) ? bucketMs : undefined,
    });
    res.json(data);
  } catch (err) {
    logger.error({ err }, 'Admin analytics query failed');
    res.status(500).json({ error: 'analytics_query_failed', message: err instanceof Error ? err.message : 'Unknown' });
  }
});

// GET /admin/analytics/keys — API key funnel analysis
router.get('/analytics/keys', async (req: Request, res: Response) => {
  if (!checkAdmin(req, res)) return;
  const store = getStore(res);
  if (!store) return;

  try {
    const sinceStr = typeof req.query.since === 'string' ? req.query.since : '';
    const sinceTimestamp = sinceStr ? new Date(sinceStr).getTime() : undefined;

    const data = await store.getApiKeyFunnel({
      sinceTimestamp: sinceTimestamp && !isNaN(sinceTimestamp) ? sinceTimestamp : undefined,
    });
    res.json(data);
  } catch (err) {
    logger.error({ err }, 'Admin key funnel query failed');
    res.status(500).json({ error: 'key_funnel_query_failed', message: err instanceof Error ? err.message : 'Unknown' });
  }
});

// GET /admin/analytics/wallets — Wallet CRM
router.get('/analytics/wallets', async (req: Request, res: Response) => {
  if (!checkAdmin(req, res)) return;
  const store = getStore(res);
  if (!store) return;

  try {
    const limitStr = typeof req.query.limit === 'string' ? req.query.limit : '';
    const limit = limitStr ? parseInt(limitStr, 10) : undefined;

    const data = await store.getWalletCRM({
      limit: limit && !isNaN(limit) ? limit : undefined,
    });
    res.json(data);
  } catch (err) {
    logger.error({ err }, 'Admin wallet CRM query failed');
    res.status(500).json({ error: 'wallet_crm_failed', message: err instanceof Error ? err.message : 'Unknown' });
  }
});

export default router;

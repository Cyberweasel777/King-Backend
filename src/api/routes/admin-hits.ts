import { Router } from 'express';
import { getHits } from '../middleware/hitCounter';
import { getOptionalConvexAnalyticsStore } from '../../shared/analytics/convex-client';

const router = Router();

function getAdminId(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function parsePositiveNumber(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

router.get('/botindex/admin/hits', (req, res) => {
  const adminId = getAdminId(req.query.adminId);

  if (adminId !== '8063432083') {
    res.status(403).json({ error: 'unauthorized' });
    return;
  }

  res.json(getHits());
});

router.get('/botindex/admin/analytics', async (req, res) => {
  const adminId = getAdminId(req.query.adminId);

  if (adminId !== '8063432083') {
    res.status(403).json({ error: 'unauthorized' });
    return;
  }

  const store = getOptionalConvexAnalyticsStore();
  if (!store) {
    res.status(503).json({
      error: 'convex_unavailable',
      message: 'Convex analytics is not configured.',
    });
    return;
  }

  const sinceHours = parsePositiveNumber(req.query.sinceHours);
  const bucketMs = parsePositiveNumber(req.query.bucketMs);
  const walletLimit = parsePositiveNumber(req.query.walletLimit);

  const sinceTimestamp =
    typeof sinceHours === 'number' ? Date.now() - Math.floor(sinceHours * 60 * 60 * 1000) : undefined;

  try {
    const [analytics, walletCRM] = await Promise.all([
      store.getAnalytics({ sinceTimestamp, bucketMs }),
      store.getWalletCRM({ limit: walletLimit }),
    ]);

    res.json({
      generatedAt: new Date().toISOString(),
      analytics,
      walletCRM,
    });
  } catch (error) {
    res.status(502).json({
      error: 'analytics_query_failed',
      message: error instanceof Error ? error.message : 'Failed to query Convex analytics',
    });
  }
});

export default router;

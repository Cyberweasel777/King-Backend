import { Router } from 'express';
import { runArbScanner } from '../../services/arbwatch/scanner';
import { withSubscriptionHttp } from '../../shared/payments';

const router = Router();

router.get('/scanner', withSubscriptionHttp('arbwatch', 'pro'), async (req, res) => {
  const limit = Number(req.query.limit ?? 25);
  const minEdgePct = Number(req.query.minEdgePct ?? 0.25);
  const maxPerEvent = Number(req.query.maxPerEvent ?? 50);

  if (!Number.isFinite(limit) || limit < 1 || limit > 200) {
    res.status(400).json({
      error: 'invalid_limit',
      message: 'limit must be a number between 1 and 200',
    });
    return;
  }

  if (!Number.isFinite(minEdgePct) || minEdgePct < 0 || minEdgePct > 100) {
    res.status(400).json({
      error: 'invalid_min_edge_pct',
      message: 'minEdgePct must be a number between 0 and 100',
    });
    return;
  }

  if (!Number.isFinite(maxPerEvent) || maxPerEvent < 1 || maxPerEvent > 500) {
    res.status(400).json({
      error: 'invalid_max_per_event',
      message: 'maxPerEvent must be a number between 1 and 500',
    });
    return;
  }

  try {
    const data = await runArbScanner({
      limit,
      minEdgePct,
      maxPerEvent,
    });

    res.json(data);
  } catch (error) {
    res.status(502).json({
      error: 'scanner_failed',
      message: (error as Error).message,
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;

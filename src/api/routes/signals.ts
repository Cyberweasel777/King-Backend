import { Router } from 'express';
import { buildHeatMap, getPredictionArbFeed } from '../../services/signals/predictionArb';
import { withSubscriptionHttp } from '../../shared/payments';

const router = Router();

router.get('/prediction-arb', (_req, res) => {
  const { feed, sourcePath } = getPredictionArbFeed();

  if (!feed) {
    res.status(404).json({
      error: 'prediction arb feed unavailable',
      sourcePath,
      hint: 'Run SpreadHunter prediction scan or set PREDICTION_ARB_FEED_PATH',
    });
    return;
  }

  res.json({
    sourcePath,
    feed,
  });
});

router.get('/prediction-arb/heatmap', withSubscriptionHttp('arbwatch', 'pro'), (_req, res) => {
  const { feed, sourcePath } = getPredictionArbFeed();

  if (!feed) {
    res.status(404).json({
      error: 'prediction arb feed unavailable',
      sourcePath,
      hint: 'Run SpreadHunter prediction scan or set PREDICTION_ARB_FEED_PATH',
    });
    return;
  }

  res.json({
    sourcePath,
    generatedAt: feed.timestamp,
    mode: feed.mode,
    heatmap: buildHeatMap(feed),
  });
});

export default router;

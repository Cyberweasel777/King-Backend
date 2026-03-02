import { Router } from 'express';

import correlationRoutes from '../../services/botindex/api/correlation.routes';
import { withSubscriptionHttp, withFreeLimit, getFreeLimitKey } from '../../shared/payments';
import x402TestRouter from './x402-test';
import x402PremiumRouter from './x402-premium';
import {
  generateCorrelationMatrix,
  identifyMarketLeaders,
  getTopCorrelatedPairs,
} from '../../services/botindex/engine/matrix';
import { fetchMultiplePriceSeries } from '../../services/botindex/engine/fetcher';
import { buildHeatMap, getPredictionArbFeed } from '../../services/signals/predictionArb';

const router = Router();
let x402RouteMounted = false;

export function mountBotindexX402TestRoute(): void {
  if (x402RouteMounted) return;
  router.use('/x402', x402TestRouter);
  router.use('/v1', x402PremiumRouter);
  x402RouteMounted = true;
}

const DEFAULT_TOKEN_UNIVERSE = [
  'solana:So11111111111111111111111111111111111111112',
  'solana:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  'solana:DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  'solana:EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
  'solana:7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
];

type BotSignal = {
  id: string;
  bot: string;
  signal: 'buy' | 'sell' | 'hold';
  token: string;
  confidence: number;
  createdAt: string;
};

const manualSignals = new Map<string, BotSignal>();

function dedupeCorrelationPairs<T extends { tokenA: string; tokenB: string }>(pairs: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];

  for (const pair of pairs) {
    const key = [pair.tokenA, pair.tokenB].sort().join('::');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(pair);
  }

  return out;
}

router.get('/health', (_req, res) => {
  res.json({
    app: 'botindex',
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

router.get('/signals/prediction-arb', (_req, res) => {
  const { feed, sourcePath } = getPredictionArbFeed();
  if (!feed) {
    res.status(404).json({ error: 'prediction_arb_unavailable', sourcePath });
    return;
  }

  const cards = feed.opportunities.slice(0, 10).map((op, i) => ({
    id: `prediction-arb-${i + 1}`,
    bot: 'prediction_arb_router',
    signal: op.estimatedNetEdgePct > 0 ? 'buy' : 'hold',
    token: `${op.eventSlug}:${op.outcome}`,
    confidence: Math.max(0, Math.min(0.99, op.estimatedNetEdgePct / 25)),
    createdAt: op.timestamp,
    metadata: {
      marketTitle: op.marketTitle,
      bestBuyVenue: op.bestBuyVenue,
      bestSellVenue: op.bestSellVenue,
      grossEdgePct: op.grossEdgePct,
      netEdgePct: op.estimatedNetEdgePct,
    },
  }));

  res.json({ sourcePath, count: cards.length, signals: cards });
});

router.get('/signals/prediction-heatmap', (_req, res) => {
  const { feed, sourcePath } = getPredictionArbFeed();
  if (!feed) {
    res.status(404).json({ error: 'prediction_heatmap_unavailable', sourcePath });
    return;
  }
  res.json({ sourcePath, generatedAt: feed.timestamp, mode: feed.mode, heatmap: buildHeatMap(feed) });
});

router.get('/signals', async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit || '10'), 10) || 10, 50);

  try {
    const priceSeriesMap = await fetchMultiplePriceSeries(DEFAULT_TOKEN_UNIVERSE, '24h');
    const priceSeries = Array.from(priceSeriesMap.values());

    if (priceSeries.length < 2) {
      const fallback = Array.from(manualSignals.values()).slice(0, limit);
      res.json({ signals: fallback, count: fallback.length, source: 'manual' });
      return;
    }

    const matrix = generateCorrelationMatrix(priceSeries, '24h');
    const top = dedupeCorrelationPairs(getTopCorrelatedPairs(matrix, Math.max(limit * 3, 10), true)).slice(0, limit);

    const generated: BotSignal[] = top.map((p, i) => ({
      id: `corr-${Date.now()}-${i}`,
      bot: 'correlation_engine',
      signal: p.correlation >= 0.6 ? 'buy' : p.correlation <= -0.6 ? 'sell' : 'hold',
      token: `${p.tokenA}↔${p.tokenB}`,
      confidence: Math.min(0.99, Math.abs(p.correlation)),
      createdAt: new Date().toISOString(),
    }));

    const merged = [...generated, ...Array.from(manualSignals.values())].slice(0, limit);
    res.json({ signals: merged, count: merged.length, source: 'generated' });
  } catch (err) {
    console.error('[BotIndex] /signals error', err);
    const fallback = Array.from(manualSignals.values()).slice(0, limit);
    res.json({ signals: fallback, count: fallback.length, source: 'manual_fallback' });
  }
});

router.post('/signals', async (req, res) => {
  const { bot, signal, token, confidence } = req.body || {};

  if (!bot || !signal || !token || typeof confidence !== 'number') {
    res.status(400).json({ error: 'invalid_payload', message: 'Require bot, signal, token, confidence(number)' });
    return;
  }

  if (!['buy', 'sell', 'hold'].includes(signal)) {
    res.status(400).json({ error: 'invalid_signal', message: 'signal must be buy|sell|hold' });
    return;
  }

  const row: BotSignal = {
    id: `manual-${Date.now()}`,
    bot: String(bot),
    signal,
    token: String(token),
    confidence: Math.max(0, Math.min(1, Number(confidence))),
    createdAt: new Date().toISOString(),
  };

  manualSignals.set(row.id, row);
  res.status(201).json(row);
});

router.use(
  async (req, res, next) => {
    // Let central payments router handle /api/:app/payments/* without bot-level gating.
    if (req.path === '/payments' || req.path.startsWith('/payments/')) {
      return next();
    }

    // x402 routes handle their own payment gating — skip subscription check.
    if (req.path.startsWith('/x402/') || req.path === '/x402') {
      return next();
    }

    // v1 premium routes use x402 gates — skip subscription check.
    if (req.path.startsWith('/v1/') || req.path === '/v1') {
      return next();
    }

    const isPairCorrelation = /^\/correlation\/[^/]+\/[^/]+/.test(req.path);

    if (isPairCorrelation) {
      return withFreeLimit({ perDay: 5, key: getFreeLimitKey })(req, res, next);
    }

    return withSubscriptionHttp('botindex', 'pro')(req, res, next);
  },
  correlationRoutes
);

router.get('/signals/:id', async (req, res) => {
  const row = manualSignals.get(req.params.id);
  if (row) {
    res.json(row);
    return;
  }

  // Build a deterministic “live” id lookup from current leaders if id is unknown.
  try {
    const priceSeriesMap = await fetchMultiplePriceSeries(DEFAULT_TOKEN_UNIVERSE, '24h');
    const priceSeries = Array.from(priceSeriesMap.values());
    if (priceSeries.length < 2) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    const leaders = identifyMarketLeaders(priceSeries);
    const first = leaders[0];
    if (!first) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    res.json({
      id: req.params.id,
      bot: 'leader_engine',
      signal: first.leadScore > 60 ? 'buy' : 'hold',
      token: first.token,
      confidence: Math.max(0, Math.min(1, Number(first.causalityStrength || 0))),
      leadScore: first.leadScore,
      createdAt: new Date().toISOString(),
    });
  } catch {
    res.status(404).json({ error: 'not_found' });
  }
});

export default router;

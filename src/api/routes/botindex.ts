import { Router } from 'express';
import { logger } from '../../utils/logger';

import correlationRoutes from '../../services/botindex/api/correlation.routes';
import { withSubscriptionHttp, withFreeLimit, getFreeLimitKey } from '../../shared/payments';
import { buildX402UpgradePayload } from '../middleware/x402Gate';
import x402TestRouter from './x402-test';
import x402PremiumRouter from './x402-premium';
import botindexSportsRouter from './botindex-sports';
import botindexCryptoRouter from './botindex-crypto';
import botindexGenesisRouter from './botindex-genesis';
import botindexCommerceRouter from './botindex-commerce';
import {
  generateCorrelationMatrix,
  identifyMarketLeaders,
  getTopCorrelatedPairs,
} from '../../services/botindex/engine/matrix';
import { fetchMultiplePriceSeries } from '../../services/botindex/engine/fetcher';
import { getBotindexTokenUniverse } from '../../services/botindex/engine/universe';
import { buildHeatMap, getPredictionArbFeed } from '../../services/signals/predictionArb';
import { optionalApiKey } from '../middleware/apiKeyAuth';
import { trackFunnelEvent } from '../../services/botindex/funnel-tracker';

const router = Router();
let x402RouteMounted = false;
const BASIC_API_KEY_DAILY_LIMIT = 100;
const BASIC_API_KEY_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const basicApiKeyQuota = new Map<string, { windowStartMs: number; count: number }>();

const INTELLIGENCE_ENDPOINTS = [
  {
    path: '/api/botindex/intel/trade-signals',
    market: 'hyperliquid',
    description: 'AI trade signal engine combining funding rates and whale positioning.',
    pricing: 'FREE teaser, full for paid API keys',
    flagship: true,
  },
  {
    path: '/api/botindex/intel/portfolio-risk',
    market: 'portfolio',
    description: 'POST portfolio risk scanner with correlated pair and hedge analysis.',
    pricing: 'FREE teaser, full for paid API keys',
  },
  {
    path: '/api/botindex/intel/convergence',
    market: 'cross-signal',
    description: 'Convergence detector across funding anomalies, whale activity, and compliance catalysts.',
    pricing: 'FREE teaser, full for paid API keys',
  },
  {
    path: '/api/botindex/intel/launch-alpha',
    market: 'zora',
    description: 'Launch alpha scoring for Zora token launches with confidence ranking.',
    pricing: 'FREE teaser, full for paid API keys',
  },
  {
    path: '/api/botindex/alpha-scan',
    market: 'cross-market',
    description: 'Flagship convergence scan across whales, funding, Zora, correlations, and meme velocity.',
    pricing: '$0.10/call (x402) or subscription bypass',
    flagship: true,
  },
  {
    path: '/api/botindex/zora/intel',
    market: 'zora',
    description: 'Zora AI intel with creator/token risk grading and opportunity ranking.',
    pricing: 'FREE teaser, full for paid API keys',
  },
  {
    path: '/api/botindex/hyperliquid/intel',
    market: 'hyperliquid',
    description: 'Funding market intelligence with risk-scored opportunities.',
    pricing: 'FREE teaser, full for paid API keys',
  },
  {
    path: '/api/botindex/crypto/intel',
    market: 'crypto',
    description: 'Correlation-driven crypto intelligence with actionable setups.',
    pricing: 'FREE teaser, full for paid API keys',
  },
  {
    path: '/api/botindex/doppler/intel',
    market: 'doppler',
    description: 'Doppler launch intelligence with quality/risk analysis.',
    pricing: 'FREE teaser, full for paid API keys',
  },
] as const;

const COMPLIANCE_ENDPOINTS = [
  {
    path: '/api/botindex/compliance/overview',
    description: 'Lightweight compliance snapshot for MCP/agent discovery (cached data only).',
    pricing: 'FREE',
    flagship: true,
  },
  {
    path: '/api/botindex/compliance/signal-desk',
    description: 'Headline analysis desk with COPY/IGNORE/COUNTER verdicts.',
    pricing: 'FREE teaser, full for paid API keys',
  },
  {
    path: '/api/botindex/compliance/threat-radar',
    description: 'Regulatory threat intelligence radar with jurisdiction risk scoring.',
    pricing: 'FREE teaser, full for paid API keys',
  },
  {
    path: '/api/botindex/compliance/exposure?project=uniswap',
    description: 'Project-level regulatory exposure scanner.',
    pricing: 'FREE teaser, full for paid API keys',
  },
  {
    path: '/api/botindex/compliance/headlines',
    description: 'Raw compliance headlines feed from live scan cache.',
    pricing: 'FREE',
  },
] as const;

function buildIntelligenceSection() {
  return {
    flagship: INTELLIGENCE_ENDPOINTS[0],
    endpoints: INTELLIGENCE_ENDPOINTS,
    notes: {
      teaser: 'Intelligence endpoints return truncated teaser output for anonymous/free users.',
      fullAccess: 'Use a paid API key for full intelligence reports. Alpha Scan also supports x402 pay-per-call.',
    },
  };
}

function buildComplianceSection() {
  return {
    flagship: COMPLIANCE_ENDPOINTS[0],
    endpoints: COMPLIANCE_ENDPOINTS,
    notes: {
      teaser: 'Threat radar and exposure endpoints return truncated teaser output for anonymous/free users.',
      fullAccess: 'Use a paid API key (Basic or Pro) for full compliance and OSINT intelligence.',
      mcpDiscovery: 'Agents should call /api/botindex/compliance/overview first for lightweight capability discovery.',
    },
  };
}

function consumeBasicApiKeyQuota(apiKey: string): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
  const now = Date.now();
  const current = basicApiKeyQuota.get(apiKey);
  if (!current || now - current.windowStartMs >= BASIC_API_KEY_WINDOW_MS) {
    basicApiKeyQuota.set(apiKey, { windowStartMs: now, count: 1 });
    return { allowed: true, remaining: BASIC_API_KEY_DAILY_LIMIT - 1, retryAfterSeconds: 0 };
  }

  if (current.count >= BASIC_API_KEY_DAILY_LIMIT) {
    const elapsedMs = now - current.windowStartMs;
    const retryAfterSeconds = Math.max(1, Math.ceil((BASIC_API_KEY_WINDOW_MS - elapsedMs) / 1000));
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  current.count += 1;
  basicApiKeyQuota.set(apiKey, current);
  return {
    allowed: true,
    remaining: Math.max(0, BASIC_API_KEY_DAILY_LIMIT - current.count),
    retryAfterSeconds: 0,
  };
}

export function mountBotindexX402TestRoute(): void {
  if (x402RouteMounted) return;
  router.use(
    ['/x402/correlation-leaders', '/v1/signals'],
    optionalApiKey,
    (req, res, next) => {
      if (!req.apiKeyAuth) {
        next();
        return;
      }

      if (req.apiKeyAuth.plan === 'pro') {
        (req as any).__freeTrialAuthenticated = true;
        res.setHeader('X-BotIndex-API-Key-Plan', 'pro');
        next();
        return;
      }

      const quota = consumeBasicApiKeyQuota(req.apiKeyAuth.apiKey);
      if (!quota.allowed) {
        res.setHeader('Retry-After', String(quota.retryAfterSeconds));

        const requestUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
        const x402Upgrade = buildX402UpgradePayload(requestUrl);
        if (x402Upgrade) {
          res.setHeader('payment-required', x402Upgrade.header);
        }

        trackFunnelEvent('rate_limit_hit', {
          endpoint: req.path,
          ip: req.ip?.slice(-6),
          source: 'botindex.basicQuota',
          plan: req.apiKeyAuth.plan,
        });

        res.status(429).json({
          error: 'api_key_rate_limited',
          message: `Free API key limit reached (${BASIC_API_KEY_DAILY_LIMIT}/day). Upgrade to Pro for unlimited access, or pay per call with x402.`,
          upgrade: {
            pro: {
              url: 'https://api.botindex.dev/api/botindex/keys/register?plan=pro',
              price: '$29/mo',
              description: 'Unlimited API access via Stripe subscription',
            },
            ...(x402Upgrade?.body || {}),
          },
          retryAfterSeconds: quota.retryAfterSeconds,
        });
        return;
      }

      (req as any).__freeTrialAuthenticated = true;
      res.setHeader('X-BotIndex-API-Key-Plan', 'basic');
      res.setHeader('X-BotIndex-API-Key-Remaining', String(quota.remaining));
      next();
    }
  );
  router.use('/x402', x402TestRouter);
  router.use('/v1', x402PremiumRouter);
  router.use('/v1', botindexSportsRouter);
  router.use('/v1', botindexCryptoRouter);
  router.use('/v1', botindexGenesisRouter);
  router.use('/v1', botindexCommerceRouter);
  x402RouteMounted = true;
}

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

router.get('/', (_req, res) => {
  res.json({
    service: 'BotIndex API',
    status: 'ok',
    docs: '/api/botindex/v1/',
    intelligence: buildIntelligenceSection(),
    compliance: buildComplianceSection(),
    timestamp: new Date().toISOString(),
  });
});

router.get(['/v1', '/v1/'], (_req, res) => {
  res.json({
    service: 'BotIndex v1 API',
    basePath: '/api/botindex/v1',
    discovery: {
      premiumSignals: '/api/botindex/v1/signals',
      sports: '/api/botindex/v1/sports',
      crypto: '/api/botindex/v1/crypto',
      solana: '/api/botindex/v1/solana',
      commerce: '/api/botindex/v1/commerce',
      compliance: '/api/botindex/compliance/overview',
    },
    intelligence: buildIntelligenceSection(),
    compliance: buildComplianceSection(),
    timestamp: new Date().toISOString(),
  });
});

router.get('/health', (_req, res) => {
  res.json({
    app: 'botindex',
    status: 'ok',
    domains: ['sports', 'crypto', 'commerce', 'zora', 'hyperliquid', 'genesis', 'signals'],
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
    const tokenUniverse = await getBotindexTokenUniverse(30);
    const priceSeriesMap = await fetchMultiplePriceSeries(tokenUniverse, '24h');
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

    // Teaser: free users see max 3 signals, paid users get full dataset
    const isPaid = (req as any).__freeTrialAuthenticated || (req as any).apiKeyAuth?.plan === 'pro';
    if (!isPaid && merged.length > 3) {
      const teaser = merged.slice(0, 3).map(s => ({ ...s, confidence: undefined }));
      res.json({
        signals: teaser,
        count: teaser.length,
        total_available: merged.length,
        source: 'generated',
        truncated: true,
        upgrade: {
          message: `${merged.length - 3} more signals available. Register a free API key for full access (3 req/day).`,
          register: 'https://king-backend.fly.dev/api/botindex/keys/register',
          limits: { anonymous: '3 req/day', free_api_key: '3 req/day', pro: 'Unlimited ($29/mo)' },
        },
      });
      return;
    }

    res.json({ signals: merged, count: merged.length, source: 'generated' });
  } catch (err) {
    logger.error({ err }, '/signals error');
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
    const tokenUniverse = await getBotindexTokenUniverse(30);
    const priceSeriesMap = await fetchMultiplePriceSeries(tokenUniverse, '24h');
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

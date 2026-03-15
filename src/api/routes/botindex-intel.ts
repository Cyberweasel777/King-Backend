/**
 * BotIndex Intel Routes — DeepSeek-powered intelligence.
 *
 * Domain intel endpoints are free-to-call with teaser responses for anonymous/free users.
 * Paid API keys receive full reports.
 *
 * Alpha Scan is the premium flagship endpoint ($0.10/call via x402 or paid API key bypass).
 */

import { NextFunction, Request, Response, Router } from 'express';
import { createX402Gate } from '../middleware/x402Gate';
import logger from '../../config/logger';
import { generateIntelReport, IntelReport } from '../../services/botindex/intel/engine';
import {
  zoraIntelConfig,
  hyperliquidIntelConfig,
  cryptoIntelConfig,
  dopplerIntelConfig,
  alphaScanConfig,
} from '../../services/botindex/intel/domains';

// Import raw data fetchers
import { getZoraTrendingCoins } from '../../services/botindex/zora/trending';
import { getAttentionMomentum } from '../../services/botindex/zora/attention';
import { getZoraCreatorScores } from '../../services/botindex/zora/creator-scores';
import { getFundingArbOpportunities } from '../../services/botindex/hyperliquid/funding-arb';
import { getHLCorrelationMatrix } from '../../services/botindex/hyperliquid/correlation';
import { getHyperliquidWhaleAlerts } from '../../services/botindex/hyperliquid/whale-alerts';
import { scanMemeTokenVelocity } from '../../services/botindex/meme/velocityScanner';

const router = Router();

const BASE_METADATA = {
  protocol: 'x402',
  version: '1.0',
  provider: 'Renaldo Corp / BotIndex',
} as const;

const TEASER_REASONING_SUFFIX = '... [upgrade for full analysis]';
const ALPHA_SCAN_CACHE_TTL_MS = 5 * 60 * 1000;

const INTEL_UPGRADE = {
  message: 'Upgrade to unlock full multi-asset intel and complete reasoning.',
  pro: {
    register: 'https://api.botindex.dev/api/botindex/keys/register?plan=pro',
    pricing: '$29/mo',
    description: 'Unlimited full intel reports via API key subscription',
  },
  x402: {
    endpoint: '/api/botindex/alpha-scan',
    pricing: '$0.10/call',
    description: 'Premium cross-market Alpha Scan via x402 pay-per-call',
    docs: 'https://www.x402.org',
  },
} as const;

const alphaScanGate = createX402Gate({
  price: '$0.10',
  description: 'BotIndex Alpha Scan convergence intelligence (0.10 USDC)',
});

let alphaScanCache: { report: IntelReport; expiresAt: number } | null = null;
let alphaScanInFlight: Promise<IntelReport> | null = null;

function isPaidApiKey(req: Request): boolean {
  return req.apiKeyAuth?.plan === 'pro' || req.apiKeyAuth?.plan === 'basic';
}

function hasFullIntelAccess(req: Request): boolean {
  if (isPaidApiKey(req)) return true;

  return Boolean(
    (req as any).__apiKeyAuthenticated ||
    (req as any).__billingMode === 'subscription' ||
    (req as any).__freeTrialAuthenticated
  );
}

function truncateReasoning(reasoning: string): string {
  const normalized = String(reasoning || '').trim();
  const clipped = normalized.slice(0, 50).trimEnd();
  return `${clipped}${TEASER_REASONING_SUFFIX}`;
}

function truncateMarketSummary(summary: string): string {
  const normalized = String(summary || '').trim();
  if (normalized.length <= 100) {
    return normalized;
  }
  return `${normalized.slice(0, 100).trimEnd()}...`;
}

function buildTeaserReport(report: IntelReport) {
  const topAsset = report.assets[0];

  return {
    ...report,
    assets: topAsset
      ? [{
          ...topAsset,
          reasoning: truncateReasoning(topAsset.reasoning),
        }]
      : [],
    marketSummary: truncateMarketSummary(report.marketSummary),
    topPick: null,
    upgrade: INTEL_UPGRADE,
    isTruncated: true,
  };
}

function sendIntelResponse(
  req: Request,
  res: Response,
  report: IntelReport,
  metadata: Record<string, unknown>
): void {
  if (hasFullIntelAccess(req)) {
    res.json({
      ...report,
      isTruncated: false,
      metadata: {
        ...metadata,
        tier: 'full',
        access: 'subscription',
      },
    });
    return;
  }

  res.json({
    ...buildTeaserReport(report),
    metadata: {
      ...metadata,
      tier: 'teaser',
      access: 'free',
    },
  });
}

function preventFreeApiKeyBypass(req: Request, _res: Response, next: NextFunction): void {
  // createX402Gate currently bypasses for any req.apiKeyAuth object.
  // For premium-only endpoints, free keys must still pay via x402.
  if (req.apiKeyAuth?.plan === 'free') {
    delete req.apiKeyAuth;
  }
  next();
}

async function generateAlphaScanReport(): Promise<IntelReport> {
  const [whales, funding, zora, correlation, memeVelocity] = await Promise.all([
    getHyperliquidWhaleAlerts(),
    getFundingArbOpportunities(),
    getZoraTrendingCoins(20),
    getHLCorrelationMatrix(),
    scanMemeTokenVelocity(),
  ]);

  // Engine-level cache key is domain-only. Use 5-min buckets to enforce 5-min refresh.
  const cacheBucket = Math.floor(Date.now() / ALPHA_SCAN_CACHE_TTL_MS);
  const report = await generateIntelReport(
    { ...alphaScanConfig, domain: `alpha-scan-${cacheBucket}` },
    { whales, funding, zora, correlation, memeVelocity }
  );

  return {
    ...report,
    domain: 'alpha-scan',
  };
}

async function getAlphaScanReportWithCache(): Promise<{ report: IntelReport; cached: boolean }> {
  const now = Date.now();

  if (alphaScanCache && alphaScanCache.expiresAt > now) {
    return { report: alphaScanCache.report, cached: true };
  }

  if (alphaScanInFlight) {
    const report = await alphaScanInFlight;
    return { report, cached: true };
  }

  alphaScanInFlight = (async () => {
    const report = await generateAlphaScanReport();
    alphaScanCache = {
      report,
      expiresAt: Date.now() + ALPHA_SCAN_CACHE_TTL_MS,
    };
    return report;
  })().finally(() => {
    alphaScanInFlight = null;
  });

  const report = await alphaScanInFlight;
  return { report, cached: false };
}

// ─── Zora Intel ─────────────────────────────────────────────────────────────

router.get('/zora/intel', async (req: Request, res: Response) => {
  try {
    // Fetch all raw Zora data in parallel
    const [trending, momentum, creators] = await Promise.all([
      getZoraTrendingCoins(15),
      getAttentionMomentum(10),
      getZoraCreatorScores(10),
    ]);

    const report = await generateIntelReport(zoraIntelConfig, {
      trending,
      momentum,
      creators,
    });

    sendIntelResponse(req, res, report, {
      ...BASE_METADATA,
      endpoint: '/botindex/zora/intel',
      market: 'zora',
    });
  } catch (error) {
    logger.error({ err: error }, 'Zora intel generation failed');
    res.status(500).json({
      error: 'intel_generation_failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      metadata: BASE_METADATA,
    });
  }
});

// ─── Hyperliquid Intel ──────────────────────────────────────────────────────

router.get('/hyperliquid/intel', async (req: Request, res: Response) => {
  try {
    const fundingData = await getFundingArbOpportunities();

    const report = await generateIntelReport(hyperliquidIntelConfig, fundingData);

    sendIntelResponse(req, res, report, {
      ...BASE_METADATA,
      endpoint: '/botindex/hyperliquid/intel',
      market: 'hyperliquid',
    });
  } catch (error) {
    logger.error({ err: error }, 'Hyperliquid intel generation failed');
    res.status(500).json({
      error: 'intel_generation_failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      metadata: BASE_METADATA,
    });
  }
});

// ─── Crypto Intel ───────────────────────────────────────────────────────────

router.get('/crypto/intel', async (req: Request, res: Response) => {
  try {
    // Fetch signals from the existing /signals endpoint handler logic
    const { getBotindexTokenUniverse } = await import('../../services/botindex/engine/universe');
    const { fetchMultiplePriceSeries } = await import('../../services/botindex/engine/fetcher');
    const { generateCorrelationMatrix, getTopCorrelatedPairs } = await import('../../services/botindex/engine/matrix');

    const tokenUniverse = await getBotindexTokenUniverse(30);
    const priceSeriesMap = await fetchMultiplePriceSeries(tokenUniverse, '24h');
    const priceSeries = Array.from(priceSeriesMap.values());

    let signals: any[] = [];
    if (priceSeries.length >= 2) {
      const matrix = generateCorrelationMatrix(priceSeries, '24h');
      const top = getTopCorrelatedPairs(matrix, 15, true);
      signals = top.map((p: any, i: number) => ({
        id: `corr-${i}`,
        bot: 'correlation_engine',
        signal: p.correlation >= 0.6 ? 'buy' : p.correlation <= -0.6 ? 'sell' : 'hold',
        token: `${p.tokenA}↔${p.tokenB}`,
        confidence: Math.min(0.99, Math.abs(p.correlation)),
      }));
    }

    const report = await generateIntelReport(cryptoIntelConfig, {
      signals,
      tokens: tokenUniverse.slice(0, 20),
    });

    sendIntelResponse(req, res, report, {
      ...BASE_METADATA,
      endpoint: '/botindex/crypto/intel',
      market: 'crypto',
    });
  } catch (error) {
    logger.error({ err: error }, 'Crypto intel generation failed');
    res.status(500).json({
      error: 'intel_generation_failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      metadata: BASE_METADATA,
    });
  }
});

// ─── Doppler Intel ──────────────────────────────────────────────────────────

router.get('/doppler/intel', async (req: Request, res: Response) => {
  try {
    // Fetch Doppler launches from Zora explore (NEW_CREATORS list)
    const url = 'https://api-sdk.zora.engineering/explore?listType=NEW_CREATORS&count=15';
    const headers: Record<string, string> = { Accept: 'application/json' };
    const apiKey = process.env.ZORA_API_KEY;
    if (apiKey) headers['api-key'] = apiKey;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    let launches: any[] = [];
    try {
      const response = await fetch(url, { headers, signal: controller.signal });
      if (response.ok) {
        const payload = await response.json() as any;
        const edges = payload?.exploreList?.edges || [];
        launches = edges.map((e: any) => {
          const n = e?.node;
          return {
            name: n?.name || '',
            symbol: n?.symbol || '',
            creator: n?.creatorProfile?.handle || n?.creatorAddress || 'unknown',
            liquidity: n?.marketCap || 0,
            volume: n?.volume24h || 0,
            holders: n?.uniqueHolders || 0,
            createdAt: n?.createdAt || '',
          };
        });
      }
    } finally {
      clearTimeout(timeout);
    }

    const report = await generateIntelReport(dopplerIntelConfig, { launches });

    sendIntelResponse(req, res, report, {
      ...BASE_METADATA,
      endpoint: '/botindex/doppler/intel',
      market: 'doppler',
    });
  } catch (error) {
    logger.error({ err: error }, 'Doppler intel generation failed');
    res.status(500).json({
      error: 'intel_generation_failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      metadata: BASE_METADATA,
    });
  }
});

// ─── Alpha Scan (Premium) ───────────────────────────────────────────────────

router.get('/alpha-scan', preventFreeApiKeyBypass, alphaScanGate, async (_req: Request, res: Response) => {
  try {
    const { report, cached } = await getAlphaScanReportWithCache();

    res.json({
      ...report,
      isTruncated: false,
      cached,
      metadata: {
        ...BASE_METADATA,
        endpoint: '/botindex/alpha-scan',
        market: 'cross-market',
        tier: 'premium',
        price: '$0.10',
        cacheTtlSeconds: 300,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Alpha Scan generation failed');
    res.status(500).json({
      error: 'alpha_scan_generation_failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      metadata: {
        ...BASE_METADATA,
        endpoint: '/botindex/alpha-scan',
        tier: 'premium',
        price: '$0.10',
      },
    });
  }
});

export default router;

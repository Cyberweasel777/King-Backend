/**
 * BotIndex Intel Routes — DeepSeek-powered premium analysis.
 *
 * Each domain gets a /intel endpoint that:
 * 1. Fetches fresh raw data from existing endpoints
 * 2. Feeds it to DeepSeek for AI analysis
 * 3. Returns structured intelligence (signals, risk scores, grades)
 *
 * All intel endpoints are premium: $0.05/call via x402 or API key.
 */

import { Request, Response, Router } from 'express';
import { createX402Gate } from '../middleware/x402Gate';
import logger from '../../config/logger';
import { generateIntelReport } from '../../services/botindex/intel/engine';
import {
  zoraIntelConfig,
  hyperliquidIntelConfig,
  cryptoIntelConfig,
  dopplerIntelConfig,
} from '../../services/botindex/intel/domains';

// Import raw data fetchers
import { getZoraTrendingCoins } from '../../services/botindex/zora/trending';
import { getAttentionMomentum } from '../../services/botindex/zora/attention';
import { getZoraCreatorScores } from '../../services/botindex/zora/creator-scores';
import { getFundingArbOpportunities } from '../../services/botindex/hyperliquid/funding-arb';

const router = Router();

const METADATA = {
  protocol: 'x402',
  version: '1.0',
  provider: 'Renaldo Corp / BotIndex',
  tier: 'premium',
  price: '$0.05',
} as const;

const intelGate = createX402Gate({
  price: '$0.05',
  description: 'BotIndex AI Intelligence Report (0.05 USDC)',
});

// ─── Zora Intel ─────────────────────────────────────────────────────────────

router.get('/zora/intel', intelGate, async (_req: Request, res: Response) => {
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

    res.json({
      ...report,
      metadata: { ...METADATA, endpoint: '/botindex/zora/intel', market: 'zora' },
    });
  } catch (error) {
    logger.error({ err: error }, 'Zora intel generation failed');
    res.status(500).json({
      error: 'intel_generation_failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      metadata: METADATA,
    });
  }
});

// ─── Hyperliquid Intel ──────────────────────────────────────────────────────

router.get('/hyperliquid/intel', intelGate, async (_req: Request, res: Response) => {
  try {
    const fundingData = await getFundingArbOpportunities();

    const report = await generateIntelReport(hyperliquidIntelConfig, fundingData);

    res.json({
      ...report,
      metadata: { ...METADATA, endpoint: '/botindex/hyperliquid/intel', market: 'hyperliquid' },
    });
  } catch (error) {
    logger.error({ err: error }, 'Hyperliquid intel generation failed');
    res.status(500).json({
      error: 'intel_generation_failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      metadata: METADATA,
    });
  }
});

// ─── Crypto Intel ───────────────────────────────────────────────────────────

router.get('/crypto/intel', intelGate, async (req: Request, res: Response) => {
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

    res.json({
      ...report,
      metadata: { ...METADATA, endpoint: '/botindex/crypto/intel', market: 'crypto' },
    });
  } catch (error) {
    logger.error({ err: error }, 'Crypto intel generation failed');
    res.status(500).json({
      error: 'intel_generation_failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      metadata: METADATA,
    });
  }
});

// ─── Doppler Intel ──────────────────────────────────────────────────────────

router.get('/doppler/intel', intelGate, async (_req: Request, res: Response) => {
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

    res.json({
      ...report,
      metadata: { ...METADATA, endpoint: '/botindex/doppler/intel', market: 'doppler' },
    });
  } catch (error) {
    logger.error({ err: error }, 'Doppler intel generation failed');
    res.status(500).json({
      error: 'intel_generation_failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      metadata: METADATA,
    });
  }
});

export default router;

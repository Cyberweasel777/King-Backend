/**
 * BotIndex Crypto Routes — Unified crypto data surface
 * Aggregates MemeRadar token data + GradSniper graduation signals
 */

import { Request, Response, Router } from 'express';
import { createX402Gate } from '../middleware/x402Gate';
import { getBotindexTokenUniverse } from '../../services/botindex/engine/universe';
import { fetchMultiplePriceSeries } from '../../services/botindex/engine/fetcher';
// Node 20+ has global fetch

const router = Router();

const GRADSNIPER_URL = process.env.GRADSNIPER_URL || 'https://gradsniper.fly.dev';

// GET /v1/crypto/tokens — Token universe with price data
router.get(
  '/crypto/tokens',
  createX402Gate({ price: '$0.02', description: 'Token universe with latest price data' }),
  async (_req: Request, res: Response) => {
    try {
      const tokenSymbols = await getBotindexTokenUniverse(30);
      const priceSeriesMap = await fetchMultiplePriceSeries(tokenSymbols, '24h');

      const tokens = tokenSymbols.map((symbol) => {
        const series = priceSeriesMap.get(symbol);
        const points = series?.data ?? [];
        const latest = points.length > 0 ? points[points.length - 1] : null;
        const first = points.length > 0 ? points[0] : null;
        const change24h =
          latest && first && first.close > 0
            ? +((latest.close - first.close) / first.close * 100).toFixed(2)
            : 0;

        return {
          symbol,
          chain: series?.chain ?? 'unknown',
          latestPrice: latest?.close ?? null,
          change24h,
          dataPoints: points.length,
        };
      });

      res.json({
        tokens,
        count: tokens.length,
        source: 'memeradar',
        updatedAt: new Date().toISOString(),
        metadata: { protocol: 'x402', endpoint: '/v1/crypto/tokens' },
      });
    } catch (error) {
      res.status(500).json({
        error: 'tokens_fetch_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

// GET /v1/crypto/graduating — Tokens approaching graduation on Catapult/Hyperliquid
router.get(
  '/crypto/graduating',
  createX402Gate({ price: '$0.02', description: 'Token graduation signals from Catapult/Hyperliquid' }),
  async (_req: Request, res: Response) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${GRADSNIPER_URL}/api/graduating`, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
      }).finally(() => clearTimeout(timeout));

      if (response.ok) {
        const data = await response.json();
        res.json({
          ...(data as object),
          source: 'gradsniper',
          proxied: true,
          metadata: { protocol: 'x402', endpoint: '/v1/crypto/graduating' },
        });
      } else if (response.status === 402) {
        res.json({
          tokens: [],
          source: 'gradsniper',
          note: 'GradSniper requires separate x402 payment for direct access. Data coming via internal feed soon.',
          updatedAt: new Date().toISOString(),
          metadata: { protocol: 'x402', endpoint: '/v1/crypto/graduating' },
        });
      } else {
        throw new Error(`GradSniper returned ${response.status}`);
      }
    } catch (error) {
      res.json({
        tokens: [],
        source: 'gradsniper',
        status: 'unavailable',
        error: error instanceof Error ? error.message : 'GradSniper unreachable',
        updatedAt: new Date().toISOString(),
        metadata: { protocol: 'x402', endpoint: '/v1/crypto/graduating' },
      });
    }
  }
);

export default router;

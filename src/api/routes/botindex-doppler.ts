import { Request, Response, Router } from 'express';
import { createX402Gate } from '../middleware/x402Gate';
import logger from '../../config/logger';
import { dopplerClient } from '../../services/botindex/doppler/client';
import { enhanceWithNarrative, formatScoreCard, scoreLaunch } from '../../services/botindex/doppler/scorer';

const router = Router();

function parseIntegerParam(value: unknown, fallback: number, min = 1, max = 500): number | null {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < min) {
    return null;
  }

  return Math.min(parsed, max);
}

function parseNumberParam(value: unknown, fallback: number, min = 0, max = Number.POSITIVE_INFINITY): number | null {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number.parseFloat(String(value));
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return null;
  }

  return parsed;
}

router.get(
  '/doppler/launches',
  createX402Gate({ price: '$0.01', description: 'Recent Doppler token launches with risk scores' }),
  async (req: Request, res: Response) => {
    const hours = parseIntegerParam(req.query.hours, 24, 1, 168);
    if (hours === null) {
      res.status(400).json({
        error: 'invalid_hours',
        message: 'Query parameter hours must be a positive integer',
      });
      return;
    }

    const limit = parseIntegerParam(req.query.limit, 20, 1, 100);
    if (limit === null) {
      res.status(400).json({
        error: 'invalid_limit',
        message: 'Query parameter limit must be a positive integer',
      });
      return;
    }

    const minScore = parseNumberParam(req.query.min_score, 0, 0, 100);
    if (minScore === null) {
      res.status(400).json({
        error: 'invalid_min_score',
        message: 'Query parameter min_score must be a number between 0 and 100',
      });
      return;
    }

    const chain = String(req.query.chain ?? 'base').toLowerCase();
    if (chain !== 'base') {
      res.status(400).json({
        error: 'invalid_chain',
        message: 'Only chain=base is currently supported for Doppler endpoints',
      });
      return;
    }

    try {
      const launches = await dopplerClient.getRecentLaunches(hours, Math.min(limit * 5, 250));
      const scored = launches.map((asset) => ({ asset, scoreCard: scoreLaunch(asset) }));
      const filtered = scored.filter((entry) => entry.scoreCard.score >= minScore).slice(0, limit);
      const enhanced = await enhanceWithNarrative(filtered.map((entry) => entry.scoreCard));

      const payload = filtered.map((entry, index) => {
        const scoreCard = enhanced[index] ?? entry.scoreCard;
        const formatted = formatScoreCard(scoreCard);

        return {
          token: {
            address: entry.asset.address,
            name: entry.asset.name,
            symbol: entry.asset.symbol,
            chainId: entry.asset.chainId,
            createdAt: entry.asset.createdAt,
            ageHours: entry.asset.ageHours,
            source: entry.asset.source,
          },
          marketCapUsd: entry.asset.marketCapUsd,
          dayVolumeUsd: entry.asset.dayVolumeUsd,
          liquidityUsd: entry.asset.liquidityUsd,
          holderCount: entry.asset.holderCount,
          migrated: entry.asset.migrated,
          integrator: entry.asset.integrator,
          score: formatted.score,
          tier: formatted.tier,
          factors: formatted.factors,
        };
      });

      res.json({
        launches: payload,
        count: payload.length,
        source: 'doppler',
        updatedAt: new Date().toISOString(),
        metadata: { protocol: 'x402' },
      });
    } catch (error) {
      logger.error({ err: error }, 'Failed to fetch Doppler launches');
      res.status(500).json({
        error: 'doppler_launches_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

router.get(
  '/doppler/score/:address',
  createX402Gate({ price: '$0.02', description: 'Deep risk score for a Doppler-launched token' }),
  async (req: Request, res: Response) => {
    const address = String(req.params.address || '').trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      res.status(400).json({
        error: 'invalid_address',
        message: 'Path parameter address must be a valid EVM address',
      });
      return;
    }

    try {
      const asset = await dopplerClient.getAssetDetails(address);
      const baseScore = scoreLaunch(asset);
      const [enhanced] = await enhanceWithNarrative([baseScore]);
      const formatted = formatScoreCard(enhanced ?? baseScore);

      res.json({
        token: {
          address: asset.address,
          name: asset.name,
          symbol: asset.symbol,
          chainId: asset.chainId,
          marketCapUsd: asset.marketCapUsd,
          dayVolumeUsd: asset.dayVolumeUsd,
          liquidityUsd: asset.liquidityUsd,
          holderCount: asset.holderCount,
          createdAt: asset.createdAt,
          ageHours: asset.ageHours,
          migrated: asset.migrated,
          integrator: asset.integrator,
          source: asset.source,
        },
        score: formatted.score,
        tier: formatted.tier,
        factors: formatted.factors,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      logger.error({ err: error, address }, 'Failed to score Doppler token');
      res.status(500).json({
        error: 'doppler_score_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

router.get(
  '/doppler/trending',
  createX402Gate({ price: '$0.01', description: 'Trending Doppler launches by volume velocity' }),
  async (req: Request, res: Response) => {
    const limit = parseIntegerParam(req.query.limit, 10, 1, 100);
    if (limit === null) {
      res.status(400).json({
        error: 'invalid_limit',
        message: 'Query parameter limit must be a positive integer',
      });
      return;
    }

    const minLiquidity = parseNumberParam(req.query.min_liquidity, 1000, 0);
    if (minLiquidity === null) {
      res.status(400).json({
        error: 'invalid_min_liquidity',
        message: 'Query parameter min_liquidity must be a non-negative number',
      });
      return;
    }

    const minHolders = parseIntegerParam(req.query.min_holders, 5, 0, 1_000_000);
    if (minHolders === null) {
      res.status(400).json({
        error: 'invalid_min_holders',
        message: 'Query parameter min_holders must be a non-negative integer',
      });
      return;
    }

    const maxAgeHours = parseIntegerParam(req.query.max_age_hours, 48, 1, 24 * 14);
    if (maxAgeHours === null) {
      res.status(400).json({
        error: 'invalid_max_age_hours',
        message: 'Query parameter max_age_hours must be a positive integer',
      });
      return;
    }

    try {
      const candidates = await dopplerClient.getTrendingAssets(Math.min(limit * 5, 250));
      const filtered = candidates
        .filter((asset) => asset.liquidityUsd >= minLiquidity)
        .filter((asset) => asset.holderCount >= minHolders)
        .filter((asset) => asset.ageHours <= maxAgeHours)
        .slice(0, limit);

      const scored = filtered.map((asset) => ({ asset, scoreCard: scoreLaunch(asset) }));
      const enhanced = await enhanceWithNarrative(scored.map((entry) => entry.scoreCard));

      const trending = scored.map((entry, index) => {
        const scoreCard = enhanced[index] ?? entry.scoreCard;
        const formatted = formatScoreCard(scoreCard);

        return {
          token: {
            address: entry.asset.address,
            name: entry.asset.name,
            symbol: entry.asset.symbol,
            chainId: entry.asset.chainId,
            createdAt: entry.asset.createdAt,
            ageHours: entry.asset.ageHours,
            source: entry.asset.source,
          },
          marketCapUsd: entry.asset.marketCapUsd,
          dayVolumeUsd: entry.asset.dayVolumeUsd,
          liquidityUsd: entry.asset.liquidityUsd,
          holderCount: entry.asset.holderCount,
          volumeVelocity: entry.asset.volumeVelocity,
          score: formatted.score,
          tier: formatted.tier,
          factors: formatted.factors,
        };
      });

      res.json({
        trending,
        count: trending.length,
        source: 'doppler',
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      logger.error({ err: error }, 'Failed to fetch Doppler trending launches');
      res.status(500).json({
        error: 'doppler_trending_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

export default router;

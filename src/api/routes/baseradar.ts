/**
 * BaseRadar — Public API routes for baseradar.app
 * No auth, no rate limiting — powered by existing velocity scanner
 */

import { Router, Request, Response } from 'express';
import { scanMemeTokenVelocity, MemeVelocitySignal } from '../../services/botindex/meme/velocityScanner';
import logger from '../../config/logger';

const router = Router();

const CHAIN_DISPLAY: Record<string, string> = {
  solana: 'Solana',
  base: 'Base',
  ethereum: 'Ethereum',
};

const VALID_CHAINS = new Set(Object.keys(CHAIN_DISPLAY));

function pickTokenFields(t: MemeVelocitySignal) {
  return {
    symbol: t.symbol,
    name: t.token,
    chain: t.chain,
    velocityScore: t.velocityScore,
    signal: t.signal,
    volume24h: t.volume24h,
    volumeChange1h: t.volumeChange1h,
    url: t.url,
  };
}

function pickAssetFields(t: MemeVelocitySignal) {
  return {
    symbol: t.symbol,
    name: t.token,
    chain: t.chain,
    velocityScore: t.velocityScore,
    signal: t.signal,
    volume24h: t.volume24h,
    volumeChange1h: t.volumeChange1h,
    marketCap: t.marketCap,
    holders: t.holders,
    url: t.url,
  };
}

function buildEcosystem(chain: string, tokens: MemeVelocitySignal[], rank: number) {
  const avgScore = tokens.length
    ? tokens.reduce((sum, t) => sum + t.velocityScore, 0) / tokens.length
    : 0;
  const surgeCount = tokens.filter((t) => t.signal === 'SURGE').length;
  const risingCount = tokens.filter((t) => t.signal === 'RISING').length;
  const sorted = [...tokens].sort((a, b) => b.velocityScore - a.velocityScore);
  const top = sorted[0];

  return {
    rank,
    slug: chain,
    name: CHAIN_DISPLAY[chain] || chain,
    avgScore: Math.round(avgScore * 10) / 10,
    surgeCount,
    risingCount,
    totalTokens: tokens.length,
    delta7d: null,
    topToken: top
      ? { symbol: top.symbol, velocityScore: top.velocityScore, signal: top.signal }
      : null,
  };
}

// GET /api/baseradar/daily-movers
router.get('/daily-movers', async (_req: Request, res: Response) => {
  try {
    const scan = await scanMemeTokenVelocity();
    const sorted = [...scan.tokens].sort((a, b) => b.velocityScore - a.velocityScore);

    const gainers = sorted.slice(0, 10).map(pickTokenFields);
    const decliners = sorted.slice(-5).reverse().map(pickTokenFields);

    res.json({
      date: new Date().toISOString().slice(0, 10),
      updatedAt: scan.fetchedAt,
      gainers,
      decliners,
      totalTracked: scan.tokens.length,
    });
  } catch (error) {
    logger.error({ err: error }, '[baseradar.daily-movers] scan failed');
    res.status(500).json({ error: 'scan_failed', message: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// GET /api/baseradar/ecosystem/rankings
router.get('/ecosystem/rankings', async (_req: Request, res: Response) => {
  try {
    const scan = await scanMemeTokenVelocity();

    const byChain: Record<string, MemeVelocitySignal[]> = {};
    for (const t of scan.tokens) {
      (byChain[t.chain] ??= []).push(t);
    }

    const ecosystems = Object.entries(byChain)
      .map(([chain, tokens]) => ({ chain, tokens, avg: tokens.reduce((s, t) => s + t.velocityScore, 0) / tokens.length }))
      .sort((a, b) => b.avg - a.avg)
      .map(({ chain, tokens }, i) => buildEcosystem(chain, tokens, i + 1));

    res.json({ updatedAt: scan.fetchedAt, ecosystems });
  } catch (error) {
    logger.error({ err: error }, '[baseradar.ecosystem.rankings] scan failed');
    res.status(500).json({ error: 'scan_failed', message: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// GET /api/baseradar/ecosystem/:chain/summary
router.get('/ecosystem/:chain/summary', async (req: Request, res: Response) => {
  try {
    const chain = req.params.chain.toLowerCase();
    if (!VALID_CHAINS.has(chain)) {
      res.status(404).json({ error: 'chain_not_found', message: `Unknown chain: ${req.params.chain}` });
      return;
    }

    const scan = await scanMemeTokenVelocity();
    const chainTokens = scan.tokens.filter((t) => t.chain === chain);
    const ecosystem = buildEcosystem(chain, chainTokens, 0);
    const topTokens = [...chainTokens]
      .sort((a, b) => b.velocityScore - a.velocityScore)
      .slice(0, 10)
      .map(pickTokenFields);

    res.json({
      updatedAt: scan.fetchedAt,
      ecosystem: { ...ecosystem, topTokens },
    });
  } catch (error) {
    logger.error({ err: error }, '[baseradar.ecosystem.summary] scan failed');
    res.status(500).json({ error: 'scan_failed', message: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// GET /api/baseradar/asset/:symbol
router.get('/asset/:symbol', async (req: Request, res: Response) => {
  try {
    const symbolQuery = req.params.symbol.toUpperCase();
    const scan = await scanMemeTokenVelocity();

    const token = scan.tokens.find((t) => t.symbol.toUpperCase() === symbolQuery);
    if (!token) {
      res.status(404).json({ error: 'asset_not_found', message: `No token found with symbol: ${req.params.symbol}` });
      return;
    }

    const chainTokens = scan.tokens
      .filter((t) => t.chain === token.chain)
      .sort((a, b) => b.velocityScore - a.velocityScore);
    const chainRank = chainTokens.findIndex((t) => t.symbol === token.symbol) + 1;

    res.json({
      updatedAt: scan.fetchedAt,
      asset: {
        ...pickAssetFields(token),
        chainRank,
        chainTotal: chainTokens.length,
      },
    });
  } catch (error) {
    logger.error({ err: error }, '[baseradar.asset] scan failed');
    res.status(500).json({ error: 'scan_failed', message: error instanceof Error ? error.message : 'Unknown error' });
  }
});

export default router;

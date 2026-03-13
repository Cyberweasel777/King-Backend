import { Request, Response, Router } from 'express';
import logger from '../../config/logger';
import { optionalApiKey } from '../middleware/apiKeyAuth';
import { createX402Gate } from '../middleware/x402Gate';
import { scanStablecoinFlows, summarizeStablecoinFlows } from '../../services/botindex/stablecoin/flowMonitor';

const router = Router();

type ChainFilter = 'base' | 'ethereum' | 'all';

function parseChain(value: unknown): ChainFilter | null {
  if (value === undefined) return 'all';
  const normalized = String(value).toLowerCase().trim();
  if (normalized === 'base' || normalized === 'ethereum' || normalized === 'all') {
    return normalized;
  }
  return null;
}

function parsePositiveNumber(value: unknown, fallback: number): number | null {
  if (value === undefined) return fallback;
  const parsed = Number.parseFloat(String(value));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function parsePositiveInt(value: unknown, fallback: number, max: number): number | null {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return null;
  return Math.min(parsed, max);
}

router.get(
  '/stablecoin/flows',
  optionalApiKey,
  createX402Gate({
    price: '$0.02',
    description: 'Stablecoin flow monitor (large USDC/USDT transfers)',
  }),
  async (req: Request, res: Response) => {
    const chain = parseChain(req.query.chain);
    if (!chain) {
      res.status(400).json({ error: 'invalid_chain', message: 'chain must be one of: base, ethereum, all' });
      return;
    }

    const minUsd = parsePositiveNumber(req.query.min_usd, 50_000);
    if (minUsd === null) {
      res.status(400).json({ error: 'invalid_min_usd', message: 'min_usd must be a positive number' });
      return;
    }

    const limit = parsePositiveInt(req.query.limit, 50, 200);
    if (limit === null) {
      res.status(400).json({ error: 'invalid_limit', message: 'limit must be a positive integer' });
      return;
    }

    try {
      const scan = await scanStablecoinFlows();

      const flows = scan.flows
        .filter((flow) => chain === 'all' || flow.chain === chain)
        .filter((flow) => flow.amountUsd >= minUsd)
        .slice(0, limit);

      res.json({
        count: flows.length,
        filters: {
          chain,
          min_usd: minUsd,
          limit,
        },
        flows,
        fetchedAt: scan.fetchedAt,
        cached: scan.cached,
        sources: scan.sources,
      });
    } catch (error) {
      logger.error({ err: error }, '[stablecoin.flows] failed');
      res.status(502).json({
        error: 'stablecoin_flow_scan_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

router.get('/stablecoin/flows/summary', async (req: Request, res: Response) => {
  const chain = parseChain(req.query.chain);
  if (!chain) {
    res.status(400).json({ error: 'invalid_chain', message: 'chain must be one of: base, ethereum, all' });
    return;
  }

  const minUsd = parsePositiveNumber(req.query.min_usd, 50_000);
  if (minUsd === null) {
    res.status(400).json({ error: 'invalid_min_usd', message: 'min_usd must be a positive number' });
    return;
  }

  try {
    const scan = await scanStablecoinFlows();
    const flows = scan.flows
      .filter((flow) => chain === 'all' || flow.chain === chain)
      .filter((flow) => flow.amountUsd >= minUsd);

    const summary = summarizeStablecoinFlows(flows);

    res.json({
      summary,
      filters: {
        chain,
        min_usd: minUsd,
      },
      fetchedAt: scan.fetchedAt,
      cached: scan.cached,
      sources: scan.sources,
    });
  } catch (error) {
    logger.error({ err: error }, '[stablecoin.flows.summary] failed');
    res.status(502).json({
      error: 'stablecoin_flow_summary_failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;

import { Request, Response, Router } from 'express';
import { createX402Gate } from '../middleware/x402Gate';
import logger from '../../config/logger';
import { hip4Client } from '../../services/botindex/hip4/client';
import { formatScoreCard, scoreMarket } from '../../services/botindex/hip4/scorer';
import { HIP4OutcomeMarket, HIP4Position, HIP4Status } from '../../services/botindex/hip4/types';

const router = Router();

const HIP4_NOT_LIVE_MESSAGE =
  'HIP-4 outcome trading is on testnet. Monitor https://app.hyperliquid.xyz for mainnet launch.';

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

function parseStatus(value: unknown): HIP4Status | null {
  const normalized = String(value).trim().toUpperCase();
  if (!normalized) {
    return null;
  }

  const statuses = Object.values(HIP4Status) as string[];
  if (!statuses.includes(normalized)) {
    return null;
  }

  return normalized as HIP4Status;
}

function parseBooleanParam(value: unknown): boolean | null {
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true;
  }

  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false;
  }

  return null;
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function summarizePositions(positions: HIP4Position[]): {
  totalPositions: number;
  uniqueHolders: number;
  yesPositions: number;
  noPositions: number;
  totalSize: number;
  yesSize: number;
  noSize: number;
  netPnl: number;
} {
  const totalPositions = positions.length;
  const uniqueHolders = new Set(
    positions
      .map((position) => position.holder.trim().toLowerCase())
      .filter((holder) => holder.length > 0)
  ).size;

  let yesPositions = 0;
  let noPositions = 0;
  let totalSize = 0;
  let yesSize = 0;
  let noSize = 0;
  let netPnl = 0;

  for (const position of positions) {
    const size = Math.max(0, position.size);
    totalSize += size;
    netPnl += Number.isFinite(position.pnl) ? position.pnl : 0;

    if (position.side === 'YES') {
      yesPositions += 1;
      yesSize += size;
    } else {
      noPositions += 1;
      noSize += size;
    }
  }

  return {
    totalPositions,
    uniqueHolders,
    yesPositions,
    noPositions,
    totalSize: round(totalSize, 4),
    yesSize: round(yesSize, 4),
    noSize: round(noSize, 4),
    netPnl: round(netPnl, 4),
  };
}

function toEpochMs(timestamp: number): number {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return 0;
  }

  return timestamp > 10_000_000_000 ? timestamp : timestamp * 1000;
}

function deriveStatus(market: HIP4OutcomeMarket): HIP4Status {
  if (market.settled) {
    return HIP4Status.SETTLED;
  }

  const nowMs = Date.now();
  const createdAtMs = toEpochMs(market.createdAt);
  const expiryMs = toEpochMs(market.expiryAt);

  if (expiryMs > 0 && expiryMs <= nowMs) {
    return HIP4Status.EXPIRED;
  }

  if (createdAtMs > nowMs) {
    return HIP4Status.PENDING;
  }

  return HIP4Status.ACTIVE;
}

router.get(
  '/hip4/markets',
  createX402Gate({ price: '$0.01', description: 'Active HIP-4 outcome markets with risk scores' }),
  async (req: Request, res: Response) => {
    const limit = parseIntegerParam(req.query.limit, 20, 1, 100);
    if (limit === null) {
      res.status(400).json({
        error: 'invalid_limit',
        message: 'Query parameter limit must be a positive integer',
      });
      return;
    }

    let statusFilter: HIP4Status | undefined;
    if (req.query.status !== undefined) {
      const parsedStatus = parseStatus(req.query.status);
      if (!parsedStatus) {
        res.status(400).json({
          error: 'invalid_status',
          message: `Query parameter status must be one of: ${Object.values(HIP4Status).join(', ')}`,
        });
        return;
      }

      statusFilter = parsedStatus;
    }

    let settledFilter: boolean | undefined;
    if (req.query.settled !== undefined) {
      const parsedSettled = parseBooleanParam(req.query.settled);
      if (parsedSettled === null) {
        res.status(400).json({
          error: 'invalid_settled',
          message: 'Query parameter settled must be a boolean (true or false)',
        });
        return;
      }

      settledFilter = parsedSettled;
    }

    if (!hip4Client.isLive()) {
      res.json({
        markets: [],
        live: false,
        message: HIP4_NOT_LIVE_MESSAGE,
        count: 0,
        source: 'hip4',
        updatedAt: new Date().toISOString(),
      });
      return;
    }

    try {
      const markets = await hip4Client.getActiveMarkets();
      const statusFiltered = statusFilter ? markets.filter((market) => deriveStatus(market) === statusFilter) : markets;
      const settledFiltered =
        settledFilter === undefined ? statusFiltered : statusFiltered.filter((market) => market.settled === settledFilter);
      const limited = settledFiltered.slice(0, limit);

      const scoredMarkets = await Promise.all(
        limited.map(async (market) => {
          const [positions, settlementStatus] = await Promise.all([
            hip4Client.getPositions(market.marketId),
            hip4Client.getSettlementStatus(market.marketId),
          ]);

          const scoreCard = formatScoreCard(scoreMarket(market, positions, settlementStatus.source ?? undefined));

          return {
            market,
            score: scoreCard.score,
            tier: scoreCard.tier,
            factors: scoreCard.factors,
          };
        })
      );

      res.json({
        markets: scoredMarkets,
        live: true,
        count: scoredMarkets.length,
        source: 'hip4',
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      logger.error({ err: error }, 'Failed to fetch HIP-4 markets');
      res.status(500).json({
        error: 'hip4_markets_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

router.get(
  '/hip4/market/:marketId',
  createX402Gate({ price: '$0.02', description: 'Deep analysis of a HIP-4 outcome market' }),
  async (req: Request, res: Response) => {
    const marketId = String(req.params.marketId || '').trim();
    if (!marketId) {
      res.status(400).json({
        error: 'invalid_market_id',
        message: 'Path parameter marketId is required',
      });
      return;
    }

    if (!hip4Client.isLive()) {
      res.json({
        live: false,
        message: HIP4_NOT_LIVE_MESSAGE,
      });
      return;
    }

    try {
      const market = await hip4Client.getMarketDetails(marketId);
      if (!market) {
        res.status(404).json({
          error: 'market_not_found',
          message: 'No HIP-4 market found for the provided marketId',
        });
        return;
      }

      const [positions, settlementStatus] = await Promise.all([
        hip4Client.getPositions(marketId),
        hip4Client.getSettlementStatus(marketId),
      ]);

      const scoreCard = formatScoreCard(scoreMarket(market, positions, settlementStatus.source ?? undefined));

      res.json({
        live: true,
        market,
        score: scoreCard.score,
        tier: scoreCard.tier,
        factors: scoreCard.factors,
        positions,
        positionSummary: summarizePositions(positions),
        settlement: settlementStatus,
        source: 'hip4',
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      logger.error({ err: error, marketId }, 'Failed to fetch HIP-4 market deep dive');
      res.status(500).json({
        error: 'hip4_market_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

router.get(
  '/hip4/settlement/:marketId',
  createX402Gate({ price: '$0.01', description: 'Settlement source tracking for a HIP-4 market' }),
  async (req: Request, res: Response) => {
    const marketId = String(req.params.marketId || '').trim();
    if (!marketId) {
      res.status(400).json({
        error: 'invalid_market_id',
        message: 'Path parameter marketId is required',
      });
      return;
    }

    if (!hip4Client.isLive()) {
      res.json({
        live: false,
        message: HIP4_NOT_LIVE_MESSAGE,
      });
      return;
    }

    try {
      const settlement = await hip4Client.getSettlementStatus(marketId);
      res.json({
        live: true,
        marketId,
        settlementSource: settlement.source,
        contract: settlement.contract,
        source: 'hip4',
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      logger.error({ err: error, marketId }, 'Failed to fetch HIP-4 settlement status');
      res.status(500).json({
        error: 'hip4_settlement_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

export default router;

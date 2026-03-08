import { Request, Response, Router } from 'express';
import { createX402Gate } from '../middleware/x402Gate';
import logger from '../../config/logger';
import { hip6Client } from '../../services/botindex/hip6/client';
import { formatScoreCard, scoreAuction } from '../../services/botindex/hip6/scorer';
import { AuctionStatus, BidStatus, HIP6Bid } from '../../services/botindex/hip6/types';

const router = Router();

const HIP6_NOT_LIVE_MESSAGE =
  'HIP-6 is not yet active on Hyperliquid. Monitor https://hyperliquid.gitbook.io for updates.';

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

function parseAuctionStatus(value: unknown): AuctionStatus | null {
  const normalized = String(value).trim().toUpperCase();
  if (!normalized) {
    return null;
  }

  const statuses = Object.values(AuctionStatus) as string[];
  if (!statuses.includes(normalized)) {
    return null;
  }

  return normalized as AuctionStatus;
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function summarizeBids(bids: HIP6Bid[]): {
  totalBids: number;
  uniqueBidders: number;
  totalBudget: number;
  averageBudget: number;
  averageMaxPrice: number;
  statusCounts: Record<BidStatus, number>;
} {
  const totalBids = bids.length;
  const uniqueBidders = new Set(
    bids
      .map((bid) => bid.bidder.trim().toLowerCase())
      .filter((bidder) => bidder.length > 0)
  ).size;

  const totalBudget = bids.reduce((acc, bid) => acc + Math.max(0, bid.budget), 0);
  const totalMaxPrice = bids.reduce((acc, bid) => acc + Math.max(0, bid.maxPrice), 0);

  const statusCounts: Record<BidStatus, number> = {
    PENDING: 0,
    ACTIVE: 0,
    CLEARED: 0,
    CANCELLED: 0,
  };

  for (const bid of bids) {
    statusCounts[bid.status] += 1;
  }

  return {
    totalBids,
    uniqueBidders,
    totalBudget: round(totalBudget),
    averageBudget: totalBids > 0 ? round(totalBudget / totalBids) : 0,
    averageMaxPrice: totalBids > 0 ? round(totalMaxPrice / totalBids, 6) : 0,
    statusCounts,
  };
}

router.get(
  '/hip6/auctions',
  createX402Gate({ price: '$0.01', description: 'Active HIP-6 token auctions with risk scores' }),
  async (req: Request, res: Response) => {
    const limit = parseIntegerParam(req.query.limit, 16, 1, 100);
    if (limit === null) {
      res.status(400).json({
        error: 'invalid_limit',
        message: 'Query parameter limit must be a positive integer',
      });
      return;
    }

    let statusFilter: AuctionStatus | undefined;
    if (req.query.status !== undefined) {
      const parsedStatus = parseAuctionStatus(req.query.status);
      if (!parsedStatus) {
        res.status(400).json({
          error: 'invalid_status',
          message: `Query parameter status must be one of: ${Object.values(AuctionStatus).join(', ')}`,
        });
        return;
      }

      statusFilter = parsedStatus;
    }

    if (!hip6Client.isLive()) {
      res.json({
        auctions: [],
        live: false,
        message: HIP6_NOT_LIVE_MESSAGE,
        count: 0,
        source: 'hip6',
        updatedAt: new Date().toISOString(),
      });
      return;
    }

    try {
      const auctions = await hip6Client.getActiveAuctions();
      const filtered = statusFilter ? auctions.filter((auction) => auction.status === statusFilter) : auctions;
      const limited = filtered.slice(0, limit);

      const scoredAuctions = await Promise.all(
        limited.map(async (auction) => {
          const [bids, clearingEvents] = await Promise.all([
            hip6Client.getAuctionBids(auction.auctionId),
            hip6Client.getClearingHistory(auction.auctionId, 100),
          ]);

          const scoreCard = formatScoreCard(scoreAuction(auction, bids, clearingEvents));

          return {
            auction,
            score: scoreCard.score,
            tier: scoreCard.tier,
            factors: scoreCard.factors,
          };
        })
      );

      res.json({
        auctions: scoredAuctions,
        live: true,
        count: scoredAuctions.length,
        source: 'hip6',
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      logger.error({ err: error }, 'Failed to fetch HIP-6 auctions');
      res.status(500).json({
        error: 'hip6_auctions_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

router.get(
  '/hip6/auction/:auctionId',
  createX402Gate({ price: '$0.02', description: 'Deep analysis of a HIP-6 auction' }),
  async (req: Request, res: Response) => {
    const auctionId = String(req.params.auctionId || '').trim();
    if (!auctionId) {
      res.status(400).json({
        error: 'invalid_auction_id',
        message: 'Path parameter auctionId is required',
      });
      return;
    }

    if (!hip6Client.isLive()) {
      res.json({
        live: false,
        message: HIP6_NOT_LIVE_MESSAGE,
      });
      return;
    }

    try {
      const auction = await hip6Client.getAuctionDetails(auctionId);
      if (!auction) {
        res.status(404).json({
          error: 'auction_not_found',
          message: 'No HIP-6 auction found for the provided auctionId',
        });
        return;
      }

      const [bids, clearingHistory] = await Promise.all([
        hip6Client.getAuctionBids(auctionId),
        hip6Client.getClearingHistory(auctionId, 200),
      ]);

      const scoreCard = formatScoreCard(scoreAuction(auction, bids, clearingHistory));

      res.json({
        live: true,
        auction,
        score: scoreCard.score,
        tier: scoreCard.tier,
        factors: scoreCard.factors,
        bidSummary: summarizeBids(bids),
        clearingHistory,
        source: 'hip6',
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      logger.error({ err: error, auctionId }, 'Failed to fetch HIP-6 auction deep dive');
      res.status(500).json({
        error: 'hip6_auction_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

router.get(
  '/hip6/clearing/:auctionId',
  createX402Gate({ price: '$0.01', description: 'Block-by-block clearing events for a HIP-6 auction' }),
  async (req: Request, res: Response) => {
    const auctionId = String(req.params.auctionId || '').trim();
    if (!auctionId) {
      res.status(400).json({
        error: 'invalid_auction_id',
        message: 'Path parameter auctionId is required',
      });
      return;
    }

    const limit = parseIntegerParam(req.query.limit, 100, 1, 1000);
    if (limit === null) {
      res.status(400).json({
        error: 'invalid_limit',
        message: 'Query parameter limit must be a positive integer',
      });
      return;
    }

    if (!hip6Client.isLive()) {
      res.json({
        live: false,
        message: HIP6_NOT_LIVE_MESSAGE,
      });
      return;
    }

    try {
      const clearing = await hip6Client.getClearingHistory(auctionId, limit);
      res.json({
        live: true,
        auctionId,
        clearing,
        count: clearing.length,
        source: 'hip6',
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      logger.error({ err: error, auctionId }, 'Failed to fetch HIP-6 clearing history');
      res.status(500).json({
        error: 'hip6_clearing_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

export default router;

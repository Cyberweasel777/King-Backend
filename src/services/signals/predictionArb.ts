import fs from 'fs';
import path from 'path';

export interface PredictionArbFeed {
  mode: 'demo' | 'live';
  timestamp: string;
  adapterSummary: Array<{ venue: string; status: string; markets: number; reason?: string }>;
  venueStats?: Array<{
    venue: string;
    marketCount: number;
    totalLiquidityUsd: number;
    totalVolume24h: number;
    avgPrice: number;
    avgResolutionHours: number | null;
  }>;
  opportunities: Array<{
    eventSlug: string;
    marketTitle: string;
    outcome: string;
    bestBuyVenue: string;
    bestSellVenue: string;
    buyPrice: number;
    sellPrice: number;
    grossEdgePct: number;
    estimatedNetEdgePct: number;
    timestamp: string;
  }>;
}

export function getPredictionArbFeed(): { feed: PredictionArbFeed | null; sourcePath: string | null } {
  const sourcePath = resolveFeedPath();
  if (!sourcePath) return { feed: null, sourcePath: null };

  try {
    const raw = fs.readFileSync(sourcePath, 'utf8');
    const parsed = JSON.parse(raw) as PredictionArbFeed;
    if (!Array.isArray(parsed?.opportunities)) {
      return { feed: null, sourcePath };
    }
    return { feed: parsed, sourcePath };
  } catch {
    return { feed: null, sourcePath };
  }
}

export function buildHeatMap(feed: PredictionArbFeed) {
  const venueStats = feed.venueStats ?? [];
  const edgeByVenue = new Map<string, number>();

  for (const op of feed.opportunities) {
    edgeByVenue.set(op.bestBuyVenue, Math.max(edgeByVenue.get(op.bestBuyVenue) ?? 0, op.estimatedNetEdgePct));
    edgeByVenue.set(op.bestSellVenue, Math.max(edgeByVenue.get(op.bestSellVenue) ?? 0, op.estimatedNetEdgePct));
  }

  return venueStats
    .map((venue) => {
      const edge = edgeByVenue.get(venue.venue) ?? 0;
      const liquidityScore = Math.min(100, venue.totalLiquidityUsd / 50000);
      const volumeScore = Math.min(100, venue.totalVolume24h / 10000);
      const edgeScore = Math.min(100, edge * 3);
      const recencyScore = venue.avgResolutionHours === null ? 30 : Math.max(0, 100 - Math.min(100, venue.avgResolutionHours / 24));
      const heatScore = round2(liquidityScore * 0.35 + volumeScore * 0.3 + edgeScore * 0.25 + recencyScore * 0.1);

      return {
        venue: venue.venue,
        liquidityUsd: venue.totalLiquidityUsd,
        volume24h: venue.totalVolume24h,
        avgPricePct: round2(venue.avgPrice * 100),
        avgResolutionHours: venue.avgResolutionHours,
        topEdgeNetPct: round2(edge),
        heatScore,
      };
    })
    .sort((a, b) => b.heatScore - a.heatScore);
}

function resolveFeedPath(): string | null {
  const envPath = process.env.PREDICTION_ARB_FEED_PATH;
  if (envPath) return envPath;

  const candidates = [
    path.resolve(process.cwd(), '..', 'dashboard', 'intel-feed-prediction-arb.json'),
    path.resolve(process.cwd(), 'dashboard', 'intel-feed-prediction-arb.json'),
    path.resolve(process.cwd(), '..', 'Projects', 'spreadhunter', 'reports', 'prediction-arb-latest.json'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

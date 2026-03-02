import { Request, Response, Router } from 'express';
import { createX402Gate } from '../middleware/x402Gate';
import { fetchMultiplePriceSeries } from '../../services/botindex/engine/fetcher';
import {
  generateCorrelationMatrix,
  identifyMarketLeaders,
  getTopCorrelatedPairs,
  TIME_WINDOWS,
} from '../../services/botindex/engine/matrix';
import { getPredictionArbFeed, buildHeatMap } from '../../services/signals/predictionArb';

const router = Router();

const METADATA = {
  protocol: 'x402',
  version: '1.0',
  provider: 'Renaldo Corp / BotIndex',
} as const;

const DEFAULT_TOKEN_UNIVERSE = [
  'solana:So11111111111111111111111111111111111111112',
  'solana:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  'solana:Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  'solana:DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  'solana:EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
  'solana:7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
  'solana:6D7NaBmqsFEK14vgtgBaHwLxBozrMBF3ZgJy5mR8yXrw',
];

const AGENT_REGISTRY: Record<string, { name: string; type: string }> = {
  spreadhunter: { name: 'SpreadHunter', type: 'sports_betting' },
  rosterradar: { name: 'RosterRadar', type: 'roster_intel' },
  arbwatch: { name: 'ArbWatch', type: 'arbitrage' },
  memeradar: { name: 'MemeRadar', type: 'meme_token' },
  botindex: { name: 'BotIndex', type: 'correlation_engine' },
};

const WINDOW_ORDER: Array<keyof typeof TIME_WINDOWS> = ['1h', '24h', '7d', '30d'];

type PredictionFeed = NonNullable<ReturnType<typeof getPredictionArbFeed>['feed']>;
type PredictionOpportunity = PredictionFeed['opportunities'][number];

function normalizeAgentId(rawAgentId: string): string {
  return rawAgentId.trim().toLowerCase();
}

function resolveAgent(rawAgentId: string): { id: string; name: string; type: string } | null {
  const id = normalizeAgentId(rawAgentId);
  const agent = AGENT_REGISTRY[id];
  if (!agent) return null;
  return { id, ...agent };
}

function parseLimit(value: unknown, defaultValue: number, maxValue: number): number {
  const parsed = Number.parseInt(String(value ?? defaultValue), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return defaultValue;
  }
  return Math.min(parsed, maxValue);
}

function dedupeCorrelationPairs<T extends { tokenA: string; tokenB: string }>(pairs: T[]): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const pair of pairs) {
    const key = [pair.tokenA, pair.tokenB].sort().join('::');
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(pair);
  }

  return deduped;
}

function filterPredictionSignalsByAgentType(
  opportunities: PredictionOpportunity[],
  agentType: string
): PredictionOpportunity[] {
  const rosterPattern = /(roster|lineup|starter|injury|trade|player|bench)/i;
  const sportsPattern = /(game|match|team|season|playoff|nfl|nba|mlb|nhl|soccer|football|basketball)/i;
  const memePattern = /(meme|token|coin|crypto|doge|shib|pepe|bonk|wif|sol|btc|eth)/i;

  if (agentType === 'arbitrage') {
    return opportunities.filter((op) => op.estimatedNetEdgePct > 0);
  }

  if (agentType === 'roster_intel') {
    const filtered = opportunities.filter(
      (op) => rosterPattern.test(op.marketTitle) || rosterPattern.test(op.eventSlug)
    );
    return filtered.length > 0 ? filtered : opportunities.slice(0, 5);
  }

  if (agentType === 'sports_betting') {
    const filtered = opportunities.filter(
      (op) => sportsPattern.test(op.marketTitle) || sportsPattern.test(op.eventSlug)
    );
    return filtered.length > 0 ? filtered : opportunities.slice(0, 5);
  }

  if (agentType === 'meme_token') {
    const filtered = opportunities.filter(
      (op) => memePattern.test(op.marketTitle) || memePattern.test(op.eventSlug)
    );
    return filtered.length > 0 ? filtered : opportunities.slice(0, 5);
  }

  return opportunities;
}

async function buildBotindexTrace(limit: number) {
  const priceSeriesMap = await fetchMultiplePriceSeries(DEFAULT_TOKEN_UNIVERSE, '24h');
  const priceSeries = Array.from(priceSeriesMap.values());

  if (priceSeries.length < 2) {
    return {
      traceType: 'correlation_leadership',
      trace: [],
      notes: 'Insufficient price data to compute leaders',
      count: 0,
    };
  }

  const leaders = identifyMarketLeaders(priceSeries).slice(0, limit);

  return {
    traceType: 'correlation_leadership',
    trace: leaders,
    count: leaders.length,
  };
}

function buildStubTrace(
  agent: { id: string; name: string; type: string },
  opportunities: PredictionOpportunity[],
  feed: PredictionFeed | null,
  sourcePath: string | null,
  limit: number
) {
  const filteredSignals = filterPredictionSignalsByAgentType(opportunities, agent.type).slice(0, limit);

  return {
    traceType: 'agent_trace_stub',
    trace: {
      summary: `${agent.name} reasoning trace generated from prediction arb stream`,
      steps: [
        'ingest_prediction_arb_feed',
        `filter_signals_by_agent_type:${agent.type}`,
        'rank_by_estimated_net_edge',
      ],
      agent,
      sourcePath,
      feedTimestamp: feed?.timestamp ?? null,
      feedMode: feed?.mode ?? null,
      filteredSignals,
    },
    count: filteredSignals.length,
  };
}

async function buildWindowSnapshot(window: keyof typeof TIME_WINDOWS, limit: number) {
  const priceSeriesMap = await fetchMultiplePriceSeries(DEFAULT_TOKEN_UNIVERSE, window);
  const priceSeries = Array.from(priceSeriesMap.values());

  if (priceSeries.length < 2) {
    return {
      window,
      label: TIME_WINDOWS[window].label,
      generatedAt: new Date().toISOString(),
      tokenCount: priceSeries.length,
      matrix: {
        tokens: priceSeries.map((series) => series.token),
        values: [],
      },
      topCorrelations: [],
      leaderAnalysis: [],
      note: 'Insufficient price data for matrix generation',
    };
  }

  const matrix = generateCorrelationMatrix(priceSeries, window);
  const leaders = identifyMarketLeaders(priceSeries).slice(0, limit);
  const topCorrelations = dedupeCorrelationPairs(
    getTopCorrelatedPairs(matrix, Math.max(limit * 2, 10), true)
  ).slice(0, limit);

  return {
    window,
    label: TIME_WINDOWS[window].label,
    generatedAt: new Date(matrix.generatedAt).toISOString(),
    tokenCount: matrix.tokens.length,
    matrix: {
      tokens: matrix.tokens,
      values: matrix.matrix,
      anomalies: matrix.anomalies,
      clusters: matrix.clusters,
    },
    topCorrelations,
    leaderAnalysis: leaders,
  };
}

router.get('/', (_req: Request, res: Response) => {
  res.json({
    service: 'BotIndex x402 Premium API',
    basePath: '/api/botindex/v1',
    metadata: METADATA,
    endpoints: [
      {
        method: 'GET',
        path: '/',
        price: 'FREE',
        description: 'Discovery endpoint listing premium routes and pricing',
      },
      {
        method: 'GET',
        path: '/trace/:agentId',
        price: '$0.05',
        description: 'Premium reasoning trace for a specific agent',
      },
      {
        method: 'GET',
        path: '/signals',
        price: '$0.10',
        description: 'Premium signal aggregation: leaders + arb + heatmap',
      },
      {
        method: 'GET',
        path: '/agent/:id/history?limit=50',
        price: '$0.25',
        description: 'Historical matrix snapshots and leader analysis across all windows',
      },
      {
        method: 'GET',
        path: '/dashboard',
        price: '$0.50',
        description: 'Full premium dashboard payload with all agents, traces, and matrices',
      },
    ],
  });
});

router.get(
  '/trace/:agentId',
  createX402Gate({
    price: '$0.05',
    description: 'BotIndex premium reasoning trace by agent',
  }),
  async (req: Request, res: Response) => {
    try {
      const agent = resolveAgent(req.params.agentId);
      if (!agent) {
        res.status(404).json({
          error: 'agent_not_found',
          message: `Unknown agentId: ${req.params.agentId}`,
          metadata: METADATA,
        });
        return;
      }

      if (agent.id === 'botindex') {
        const botindexTrace = await buildBotindexTrace(10);
        res.json({
          agent,
          ...botindexTrace,
          timestamp: new Date().toISOString(),
          metadata: METADATA,
        });
        return;
      }

      const { feed, sourcePath } = getPredictionArbFeed();
      const opportunities = feed?.opportunities ?? [];
      const stubTrace = buildStubTrace(agent, opportunities, feed, sourcePath, 10);

      res.json({
        agent,
        ...stubTrace,
        timestamp: new Date().toISOString(),
        metadata: METADATA,
      });
    } catch (error) {
      res.status(500).json({
        error: 'trace_fetch_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        metadata: METADATA,
      });
    }
  }
);

router.get(
  '/signals',
  createX402Gate({
    price: '$0.10',
    description: 'BotIndex premium aggregated signals feed',
  }),
  async (_req: Request, res: Response) => {
    try {
      const priceSeriesMap = await fetchMultiplePriceSeries(DEFAULT_TOKEN_UNIVERSE, '24h');
      const priceSeries = Array.from(priceSeriesMap.values());

      const correlationLeaders =
        priceSeries.length >= 2 ? identifyMarketLeaders(priceSeries).slice(0, 5) : [];

      const { feed, sourcePath } = getPredictionArbFeed();
      const opportunities = (feed?.opportunities ?? []).slice(0, 10);
      const heatmapRows = feed ? buildHeatMap(feed) : [];

      const signals = [
        ...correlationLeaders.map((leader, index) => ({
          id: `leader-${index + 1}`,
          channel: 'correlation_leader',
          token: leader.token,
          signal: leader.leadScore >= 60 ? 'buy' : 'hold',
          confidence: Math.max(0, Math.min(1, leader.leadScore / 100)),
          score: leader.leadScore,
          timestamp: new Date().toISOString(),
        })),
        ...opportunities.map((opportunity, index) => ({
          id: `prediction-arb-${index + 1}`,
          channel: 'prediction_arb',
          token: `${opportunity.eventSlug}:${opportunity.outcome}`,
          signal: opportunity.estimatedNetEdgePct > 0 ? 'buy' : 'hold',
          confidence: Math.max(0, Math.min(0.99, opportunity.estimatedNetEdgePct / 25)),
          score: opportunity.estimatedNetEdgePct,
          timestamp: opportunity.timestamp,
        })),
      ];

      res.json({
        signals,
        correlationLeaders,
        predictionArb: {
          sourcePath,
          timestamp: feed?.timestamp ?? null,
          mode: feed?.mode ?? null,
          opportunities,
          count: opportunities.length,
        },
        heatmap: {
          rows: heatmapRows,
          count: heatmapRows.length,
        },
        count: signals.length,
        timestamp: new Date().toISOString(),
        metadata: METADATA,
      });
    } catch (error) {
      res.status(500).json({
        error: 'signals_fetch_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        metadata: METADATA,
      });
    }
  }
);

router.get(
  '/agent/:id/history',
  createX402Gate({
    price: '$0.25',
    description: 'BotIndex premium historical matrix and leader analysis',
  }),
  async (req: Request, res: Response) => {
    try {
      const agent = resolveAgent(req.params.id);
      if (!agent) {
        res.status(404).json({
          error: 'agent_not_found',
          message: `Unknown agent id: ${req.params.id}`,
          metadata: METADATA,
        });
        return;
      }

      const limit = parseLimit(req.query.limit, 50, 100);

      const snapshots = await Promise.all(
        WINDOW_ORDER.map((window) => buildWindowSnapshot(window, limit))
      );

      res.json({
        agent,
        limit,
        snapshots,
        count: snapshots.length,
        timestamp: new Date().toISOString(),
        metadata: METADATA,
      });
    } catch (error) {
      res.status(500).json({
        error: 'history_fetch_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        metadata: METADATA,
      });
    }
  }
);

router.get(
  '/dashboard',
  createX402Gate({
    price: '$0.50',
    description: 'BotIndex premium all-in-one dashboard payload',
  }),
  async (_req: Request, res: Response) => {
    try {
      const priceSeriesMap = await fetchMultiplePriceSeries(DEFAULT_TOKEN_UNIVERSE, '24h');
      const priceSeries = Array.from(priceSeriesMap.values());

      const matrix =
        priceSeries.length >= 2 ? generateCorrelationMatrix(priceSeries, '24h') : null;
      const correlationLeaders =
        priceSeries.length >= 2 ? identifyMarketLeaders(priceSeries) : [];
      const correlatedPairs = matrix
        ? dedupeCorrelationPairs(getTopCorrelatedPairs(matrix, 100, false))
        : [];

      const { feed, sourcePath } = getPredictionArbFeed();
      const opportunities = feed?.opportunities ?? [];
      const heatmapRows = feed ? buildHeatMap(feed) : [];

      const traces = Object.entries(AGENT_REGISTRY).map(([agentId, agentMeta]) => {
        if (agentId === 'botindex') {
          return {
            agentId,
            ...agentMeta,
            traceType: 'correlation_leadership',
            trace: correlationLeaders,
            count: correlationLeaders.length,
          };
        }

        const filteredSignals = filterPredictionSignalsByAgentType(
          opportunities,
          agentMeta.type
        );

        return {
          agentId,
          ...agentMeta,
          traceType: 'agent_trace_stub',
          trace: {
            summary: `${agentMeta.name} stub trace from prediction arb stream`,
            filteredSignals,
          },
          count: filteredSignals.length,
        };
      });

      const signals = [
        ...correlationLeaders.map((leader, index) => ({
          id: `leader-${index + 1}`,
          type: 'correlation_leader',
          token: leader.token,
          score: leader.leadScore,
          confidence: Math.max(0, Math.min(1, leader.leadScore / 100)),
        })),
        ...correlatedPairs.map((pair, index) => ({
          id: `corr-pair-${index + 1}`,
          type: 'correlation_pair',
          tokenA: pair.tokenA,
          tokenB: pair.tokenB,
          score: pair.correlation,
          confidence: Math.min(0.99, Math.abs(pair.correlation)),
        })),
        ...opportunities.map((opportunity, index) => ({
          id: `arb-${index + 1}`,
          type: 'prediction_arb',
          eventSlug: opportunity.eventSlug,
          outcome: opportunity.outcome,
          score: opportunity.estimatedNetEdgePct,
          confidence: Math.max(0, Math.min(0.99, opportunity.estimatedNetEdgePct / 25)),
        })),
      ];

      res.json({
        agents: Object.entries(AGENT_REGISTRY).map(([id, agent]) => ({ id, ...agent })),
        signals,
        traces,
        correlationMatrix: matrix
          ? {
              window: '24h',
              generatedAt: new Date(matrix.generatedAt).toISOString(),
              tokens: matrix.tokens,
              matrix: matrix.matrix,
              clusters: matrix.clusters,
              anomalies: matrix.anomalies,
            }
          : {
              window: '24h',
              generatedAt: new Date().toISOString(),
              tokens: [],
              matrix: [],
              clusters: [],
              anomalies: [],
              note: 'Insufficient price data for correlation matrix generation',
            },
        predictionArb: {
          sourcePath,
          timestamp: feed?.timestamp ?? null,
          mode: feed?.mode ?? null,
          adapterSummary: feed?.adapterSummary ?? [],
          venueStats: feed?.venueStats ?? [],
          opportunities,
        },
        heatmap: {
          rows: heatmapRows,
          count: heatmapRows.length,
        },
        count: signals.length,
        timestamp: new Date().toISOString(),
        metadata: METADATA,
      });
    } catch (error) {
      res.status(500).json({
        error: 'dashboard_fetch_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        metadata: METADATA,
      });
    }
  }
);

export default router;

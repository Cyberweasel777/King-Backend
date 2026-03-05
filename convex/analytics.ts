import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

type CounterMap = Record<string, number>;

type EndpointAccumulator = {
  endpoint: string;
  hits: number;
  uniqueVisitors: Set<string>;
  lastHit: number;
  methods: CounterMap;
  statusCodes: CounterMap;
  paidHits: number;
};

type TimeBucketAccumulator = {
  bucketStart: number;
  hits: number;
  uniqueVisitors: Set<string>;
  paidHits: number;
};

function inc(map: CounterMap, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

function bucketStart(timestamp: number, bucketMs: number): number {
  return Math.floor(timestamp / bucketMs) * bucketMs;
}

export const logRequest = mutation({
  args: {
    endpoint: v.string(),
    method: v.string(),
    visitorHash: v.string(),
    walletAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    referrer: v.optional(v.string()),
    statusCode: v.number(),
    x402Paid: v.boolean(),
    responseTimeMs: v.optional(v.number()),
    timestamp: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('apiRequests', args);

    const walletAddress = args.walletAddress;
    if (!walletAddress) {
      return;
    }

    const existing = await ctx.db
      .query('wallets')
      .withIndex('by_address', (q) => q.eq('address', walletAddress))
      .unique();

    if (existing) {
      const nextEndpoints = existing.endpoints.includes(args.endpoint)
        ? existing.endpoints
        : [...existing.endpoints, args.endpoint];

      await ctx.db.patch(existing._id, {
        firstSeen: Math.min(existing.firstSeen, args.timestamp),
        lastSeen: Math.max(existing.lastSeen, args.timestamp),
        totalRequests: existing.totalRequests + 1,
        totalPaidUsd: existing.totalPaidUsd,
        endpoints: nextEndpoints,
      });
      return;
    }

    await ctx.db.insert('wallets', {
      address: walletAddress,
      firstSeen: args.timestamp,
      lastSeen: args.timestamp,
      totalRequests: 1,
      totalPaidUsd: 0,
      endpoints: [args.endpoint],
    });
  },
});

export const getAnalytics = query({
  args: {
    sinceTimestamp: v.optional(v.number()),
    bucketMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const sinceTimestamp = args.sinceTimestamp;
    const rows =
      typeof sinceTimestamp === 'number'
        ? await ctx.db
            .query('apiRequests')
            .withIndex('by_timestamp', (q) => q.gte('timestamp', sinceTimestamp))
            .collect()
        : await ctx.db.query('apiRequests').withIndex('by_timestamp').collect();

    const bucketMs = Math.max(60_000, Math.min(args.bucketMs ?? 3_600_000, 86_400_000));

    const globalVisitors = new Set<string>();
    const endpointMap = new Map<string, EndpointAccumulator>();
    const bucketMap = new Map<number, TimeBucketAccumulator>();
    const methodBreakdown: CounterMap = {};
    const statusBreakdown: CounterMap = {};

    let fromTimestamp: number | null = null;
    let toTimestamp: number | null = null;
    let paidHits = 0;

    for (const row of rows) {
      globalVisitors.add(row.visitorHash);
      inc(methodBreakdown, row.method);
      inc(statusBreakdown, String(row.statusCode));

      if (row.x402Paid) paidHits += 1;
      if (fromTimestamp === null || row.timestamp < fromTimestamp) fromTimestamp = row.timestamp;
      if (toTimestamp === null || row.timestamp > toTimestamp) toTimestamp = row.timestamp;

      let endpoint = endpointMap.get(row.endpoint);
      if (!endpoint) {
        endpoint = {
          endpoint: row.endpoint,
          hits: 0,
          uniqueVisitors: new Set<string>(),
          lastHit: row.timestamp,
          methods: {},
          statusCodes: {},
          paidHits: 0,
        };
        endpointMap.set(row.endpoint, endpoint);
      }

      endpoint.hits += 1;
      endpoint.uniqueVisitors.add(row.visitorHash);
      endpoint.lastHit = Math.max(endpoint.lastHit, row.timestamp);
      inc(endpoint.methods, row.method);
      inc(endpoint.statusCodes, String(row.statusCode));
      if (row.x402Paid) endpoint.paidHits += 1;

      const bucketKey = bucketStart(row.timestamp, bucketMs);
      let bucket = bucketMap.get(bucketKey);
      if (!bucket) {
        bucket = {
          bucketStart: bucketKey,
          hits: 0,
          uniqueVisitors: new Set<string>(),
          paidHits: 0,
        };
        bucketMap.set(bucketKey, bucket);
      }

      bucket.hits += 1;
      bucket.uniqueVisitors.add(row.visitorHash);
      if (row.x402Paid) bucket.paidHits += 1;
    }

    const perEndpoint = Array.from(endpointMap.values())
      .map((endpoint) => ({
        endpoint: endpoint.endpoint,
        hits: endpoint.hits,
        uniqueVisitors: endpoint.uniqueVisitors.size,
        lastHit: endpoint.lastHit,
        methods: endpoint.methods,
        statusCodes: endpoint.statusCodes,
        paidHits: endpoint.paidHits,
      }))
      .sort((a, b) => b.hits - a.hits);

    const timeSeries = Array.from(bucketMap.values())
      .map((bucket) => ({
        bucketStart: bucket.bucketStart,
        hits: bucket.hits,
        uniqueVisitors: bucket.uniqueVisitors.size,
        paidHits: bucket.paidHits,
      }))
      .sort((a, b) => a.bucketStart - b.bucketStart);

    const totalHits = rows.length;
    const elapsedMinutes =
      fromTimestamp !== null && toTimestamp !== null
        ? Math.max((Math.max(toTimestamp, fromTimestamp + 1_000) - fromTimestamp) / 60_000, 1 / 60)
        : 0;

    return {
      totalHits,
      uniqueVisitors: globalVisitors.size,
      paidHits,
      hitsPerMinute: elapsedMinutes > 0 ? Number((totalHits / elapsedMinutes).toFixed(2)) : 0,
      fromTimestamp,
      toTimestamp,
      methodBreakdown,
      statusBreakdown,
      perEndpoint,
      timeSeries,
      bucketMs,
    };
  },
});

export const getWalletCRM = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 1_000, 5_000));
    const rows = await ctx.db.query('wallets').withIndex('by_firstSeen').collect();
    return rows.sort((a, b) => b.lastSeen - a.lastSeen).slice(0, limit);
  },
});

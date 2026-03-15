interface ConvexEnvelope<T> {
  status: 'success' | 'error';
  value?: T;
  errorMessage?: string;
}

export interface ApiRequestLog {
  endpoint: string;
  method: string;
  visitorHash: string;
  walletAddress?: string;
  userAgent?: string;
  referrer?: string;
  statusCode: number;
  x402Paid: boolean;
  responseTimeMs?: number;
  timestamp: number;
  apiKeyHash?: string;
  apiKeyPlan?: string;
}

export interface EndpointAnalyticsRow {
  endpoint: string;
  hits: number;
  uniqueVisitors: number;
  lastHit: number;
  methods: Record<string, number>;
  statusCodes: Record<string, number>;
  paidHits: number;
}

export interface TimeSeriesRow {
  bucketStart: number;
  hits: number;
  uniqueVisitors: number;
  paidHits: number;
}

export interface AnalyticsSummary {
  totalHits: number;
  uniqueVisitors: number;
  paidHits: number;
  hitsPerMinute: number;
  fromTimestamp: number | null;
  toTimestamp: number | null;
  methodBreakdown: Record<string, number>;
  statusBreakdown: Record<string, number>;
  perEndpoint: EndpointAnalyticsRow[];
  timeSeries: TimeSeriesRow[];
  bucketMs: number;
}

export interface WalletCRMRow {
  _id: string;
  address: string;
  firstSeen: number;
  lastSeen: number;
  totalRequests: number;
  totalPaidUsd: number;
  endpoints: string[];
}

export interface ApiKeyFunnelEntry {
  apiKeyHash: string;
  plan: string;
  firstRequest: number;
  lastRequest: number;
  totalRequests: number;
  uniqueEndpoints: number;
  endpointList: string[];
  statusCodes: Record<string, number>;
  daysSinceFirst: number;
  daysSinceLast: number;
}

export interface ApiKeyFunnelSummary {
  totalTrackedKeys: number;
  activeKeys: number;
  dormantKeys: number;
  deadKeys: number;
  noKeyRequests: number;
  keys: ApiKeyFunnelEntry[];
}

export interface ConvexAnalyticsStore {
  logRequest(request: ApiRequestLog): Promise<void>;
  getAnalytics(args?: { sinceTimestamp?: number; bucketMs?: number }): Promise<AnalyticsSummary>;
  getWalletCRM(args?: { limit?: number }): Promise<WalletCRMRow[]>;
  getApiKeyFunnel(args?: { sinceTimestamp?: number }): Promise<ApiKeyFunnelSummary>;
}

class ConvexHttpAnalyticsStore implements ConvexAnalyticsStore {
  constructor(private readonly url: string, private readonly adminKey: string) {}

  private async request<T>(kind: 'query' | 'mutation', path: string, args: unknown): Promise<T> {
    const response = await fetch(`${this.url}/api/${kind}`, {
      method: 'POST',
      headers: {
        Authorization: `Convex ${this.adminKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path, args }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Convex ${kind} failed (${response.status}): ${text}`);
    }

    const body = (await response.json()) as ConvexEnvelope<T>;
    if (body.status !== 'success') {
      throw new Error(body.errorMessage || `Convex ${kind} failed for ${path}`);
    }

    return body.value as T;
  }

  async logRequest(request: ApiRequestLog): Promise<void> {
    await this.request<null>('mutation', 'analytics:logRequest', request);
  }

  async getAnalytics(args: { sinceTimestamp?: number; bucketMs?: number } = {}): Promise<AnalyticsSummary> {
    return this.request<AnalyticsSummary>('query', 'analytics:getAnalytics', args);
  }

  async getWalletCRM(args: { limit?: number } = {}): Promise<WalletCRMRow[]> {
    return this.request<WalletCRMRow[]>('query', 'analytics:getWalletCRM', args);
  }

  async getApiKeyFunnel(args: { sinceTimestamp?: number } = {}): Promise<ApiKeyFunnelSummary> {
    return this.request<ApiKeyFunnelSummary>('query', 'analytics:getApiKeyFunnel', args);
  }
}

let cachedStore: ConvexAnalyticsStore | null | undefined;

export function getOptionalConvexAnalyticsStore(): ConvexAnalyticsStore | null {
  if (cachedStore !== undefined) {
    return cachedStore;
  }

  const url = process.env.CONVEX_URL;
  const adminKey = process.env.CONVEX_ADMIN_KEY;

  if (!url || !adminKey) {
    cachedStore = null;
    return cachedStore;
  }

  cachedStore = new ConvexHttpAnalyticsStore(url.replace(/\/$/, ''), adminKey);
  return cachedStore;
}

export function getConvexAnalyticsStore(): ConvexAnalyticsStore {
  const store = getOptionalConvexAnalyticsStore();
  if (!store) {
    throw new Error('CONVEX_URL and CONVEX_ADMIN_KEY must be set for analytics persistence');
  }
  return store;
}

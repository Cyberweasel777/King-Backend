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
    getAnalytics(args?: {
        sinceTimestamp?: number;
        bucketMs?: number;
    }): Promise<AnalyticsSummary>;
    getWalletCRM(args?: {
        limit?: number;
    }): Promise<WalletCRMRow[]>;
    getApiKeyFunnel(args?: {
        sinceTimestamp?: number;
    }): Promise<ApiKeyFunnelSummary>;
}
export declare function getOptionalConvexAnalyticsStore(): ConvexAnalyticsStore | null;
export declare function getConvexAnalyticsStore(): ConvexAnalyticsStore;
//# sourceMappingURL=convex-client.d.ts.map
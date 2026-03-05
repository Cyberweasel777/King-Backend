export interface ArbScannerQuery {
    limit: number;
    minEdgePct: number;
    maxPerEvent: number;
}
export interface ArbScannerOpportunity {
    id: string;
    eventKey: string;
    eventTitle: string;
    outcome: string;
    buy: {
        venue: string;
        price: number;
        feeBps: number;
        effectivePrice: number;
    };
    sell: {
        venue: string;
        price: number;
        feeBps: number;
        effectivePrice: number;
    };
    grossEdgePct: number;
    netEdgePct: number;
    liquidityScore: number;
    detectedAt: string;
    source: 'live_scan' | 'feed';
}
export interface ArbScannerResponse {
    generatedAt: string;
    query: ArbScannerQuery;
    sourceStatus: Array<{
        source: string;
        ok: boolean;
        markets: number;
        errors: string[];
    }>;
    opportunities: ArbScannerOpportunity[];
}
type PricePoint = {
    eventKey: string;
    eventTitle: string;
    outcome: string;
    venue: string;
    yesPrice: number;
    noPrice: number;
    liquidity: number;
};
export declare function rankScannerOpportunities(points: PricePoint[], query: ArbScannerQuery): ArbScannerOpportunity[];
export declare function runArbScanner(query: ArbScannerQuery): Promise<ArbScannerResponse>;
export {};
//# sourceMappingURL=scanner.d.ts.map
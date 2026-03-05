/**
 * Agentic Commerce Comparator — Neutral intelligence layer across ACP/UCP/x402
 *
 * Helps buying agents decide: which product, which merchant, which protocol,
 * which price is optimal before they execute a purchase.
 */
export interface MerchantOffer {
    merchant: string;
    merchantId: string;
    product: string;
    price: number;
    currency: string;
    protocol: 'acp' | 'ucp' | 'x402' | 'direct';
    protocolVersion: string;
    checkoutUrl: string | null;
    trustScore: number;
    responseTimeMs: number;
    availableInventory: boolean;
    shippingEstimate: string | null;
    returnPolicy: string | null;
    fees: {
        platformFeePct: number;
        paymentFeePct: number;
        totalFeePct: number;
    };
    metadata: Record<string, unknown>;
}
export interface ComparisonRequest {
    query: string;
    category?: string;
    maxPrice?: number;
    preferredProtocol?: string;
    limit?: number;
}
export interface ComparisonResult {
    query: string;
    offers: MerchantOffer[];
    recommendation: {
        bestValue: string;
        bestTrust: string;
        bestSpeed: string;
        reasoning: string;
    };
    protocolBreakdown: {
        protocol: string;
        offerCount: number;
        avgPrice: number;
        avgTrustScore: number;
        avgFees: number;
    }[];
    updatedAt: string;
}
declare const PROTOCOL_FEES: Record<string, {
    platformPct: number;
    paymentPct: number;
}>;
export declare function compareOffers(req: ComparisonRequest): Promise<ComparisonResult>;
export declare function getProtocolDirectory(): Promise<{
    protocols: {
        name: string;
        version: string;
        maintainers: string;
        fees: typeof PROTOCOL_FEES['acp'];
        merchantCount: number;
        description: string;
    }[];
    updatedAt: string;
}>;
export {};
//# sourceMappingURL=comparator.d.ts.map
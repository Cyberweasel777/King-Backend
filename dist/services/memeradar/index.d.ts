/**
 * MemeRadar service facade for King Backend
 * Provides token discovery + trending + whale transactions.
 */
import type { TokenData, TrendingToken, WhaleTransaction } from './types';
import { type ProvenanceReport } from './provenance';
import { type AlertTelemetry, type TriggeredAlert } from './alerts';
type WhalesDebugInfo = {
    signaturesFetched: number;
    txDetailsAttempted: number;
    txDetailsSucceeded: number;
    parsedTransfers: number;
    firstError?: string;
    heliusStatusCodes?: {
        getSignaturesForAddress?: number;
        getTransaction: number[];
    };
};
export declare function getTokens(params?: {
    q?: string;
    limit?: number;
    chain?: string;
}): Promise<TokenData[]>;
export declare function getTrending(params?: {
    limit?: number;
    chain?: 'solana' | 'base';
}): Promise<TrendingToken[]>;
export declare function getWhales(params: {
    wallet: string;
    limit?: number;
}): Promise<WhaleTransaction[]>;
export declare function getWhalesWithDebug(params: {
    wallet: string;
    limit?: number;
}): Promise<{
    whales: WhaleTransaction[];
    debug: WhalesDebugInfo;
}>;
export declare function resolveToken(identifier: string, chain?: 'solana' | 'base'): Promise<TokenData | null>;
export declare function getTokenReport(identifier: string, chain?: 'solana' | 'base'): Promise<{
    token: TokenData;
    provenance: ProvenanceReport;
} | null>;
export declare function evaluateTokenAlerts(telemetry: AlertTelemetry): TriggeredAlert[];
export {};
//# sourceMappingURL=index.d.ts.map
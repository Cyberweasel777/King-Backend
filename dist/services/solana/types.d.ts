export interface SolanaAnchorRequest {
    receipt: Record<string, unknown>;
    authorizedKeys: string[];
    timestampWindow: {
        min: string | number;
        max: string | number;
    };
}
export interface SolanaAnchorResult {
    proofHash: string;
    txSignature: string;
    solanaSlot: number;
    anchorId: string;
    timestamp: string;
    receiptHash: string;
    authorizedKeysHash: string;
    timestampWindowHash: string;
    proofInputHash: string;
}
export interface SolanaAnchorMeta {
    proofHash: string;
    txSignature: string;
    slot: number;
    timestamp: string;
    anchorId: string;
}
export interface SolanaVerifyResult {
    verified: boolean;
    anchorMeta: Pick<SolanaAnchorMeta, 'slot' | 'timestamp' | 'anchorId'> | null;
}
export interface SolanaRegistryQuery {
    limit: number;
    offset: number;
    since?: string;
}
export interface SolanaRegistryResult {
    total: number;
    anchors: SolanaAnchorMeta[];
    hasMore: boolean;
}
export interface SolanaConfig {
    rpcUrl: string;
    live: boolean;
    timeoutMs: number;
    maxRetries: number;
    retryDelayMs: number;
}
//# sourceMappingURL=types.d.ts.map
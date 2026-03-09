export interface BaseAnchorRequest {
    receipt: Record<string, unknown>;
    authorizedKeys: string[];
    timestampWindow: {
        min: string | number;
        max: string | number;
    };
}
export interface BaseAnchorResult {
    proofHash: string;
    txHash: string;
    baseBlock: number;
    anchorId: string;
    timestamp: string;
    chainId: number;
    receiptHash: string;
    authorizedKeysHash: string;
    timestampWindowHash: string;
    proofInputHash: string;
}
export interface BaseAnchorMeta {
    proofHash: string;
    txHash: string;
    block: number;
    timestamp: string;
    anchorId: string;
    chainId: number;
}
export interface BaseVerifyResult {
    verified: boolean;
    anchorMeta: Pick<BaseAnchorMeta, 'block' | 'timestamp' | 'anchorId' | 'chainId'> | null;
}
export interface BaseRegistryQuery {
    limit: number;
    offset: number;
    since?: string;
}
export interface BaseRegistryResult {
    total: number;
    anchors: BaseAnchorMeta[];
    hasMore: boolean;
}
export interface BaseConfig {
    rpcUrl: string;
    live: boolean;
    chainId: number;
    timeoutMs: number;
    maxRetries: number;
    retryDelayMs: number;
}
//# sourceMappingURL=types.d.ts.map
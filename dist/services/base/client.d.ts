import type { BaseAnchorRequest, BaseAnchorResult, BaseConfig, BaseRegistryQuery, BaseRegistryResult, BaseVerifyResult } from './types';
interface BaseProofInputs {
    receiptHash: string;
    authorizedKeysHash: string;
    timestampWindowHash: string;
    proofInputHash: string;
    proofHash: string;
}
export declare function canonicalStringify(value: unknown): string;
export declare function sha256Hex(value: string | Buffer): string;
export declare function normalizeBaseProofHash(value: string): string | null;
export declare function buildBaseProofInputs(request: BaseAnchorRequest): BaseProofInputs;
export declare class BaseClient {
    private readonly config;
    private readonly stubAnchors;
    private readonly liveAnchors;
    private readonly contractAddress;
    private readonly fromAddress;
    private readonly anchorSelector;
    private readonly verifySelector;
    private readonly anchoredEventTopic;
    constructor(config?: Partial<BaseConfig>);
    isLiveMode(): boolean;
    getConfig(): BaseConfig;
    anchorProof(request: BaseAnchorRequest): Promise<BaseAnchorResult>;
    verifyProof(proofHash: string): Promise<BaseVerifyResult>;
    getAnchors(query: BaseRegistryQuery): Promise<BaseRegistryResult>;
    private buildSimulatedAnchor;
    private deriveTxHash;
    private deriveBlock;
    private readChainId;
    private readLatestBlock;
    private submitAnchorTransaction;
    private verifyProofOnChain;
    private readAnchorsFromChain;
    private readBlockTimestamp;
    private decodeEvmBoolean;
    private encodeBytes32Call;
    private callRpcWithRetry;
    private callRpc;
}
export {};
//# sourceMappingURL=client.d.ts.map
import type { AnchorRequest, AnchorResult, AztecConfig, RegistryQuery, RegistryResult, VerifyResult } from './types';
interface ProofInputs {
    receiptHash: string;
    authorizedKeysHash: string;
    timestampWindowHash: string;
    proofInputHash: string;
    proofHash: string;
}
export declare function canonicalStringify(value: unknown): string;
export declare function sha256Hex(value: string | Buffer): string;
export declare function normalizeProofHash(value: string): string | null;
export declare function buildProofInputs(request: AnchorRequest): ProofInputs;
export declare class AztecClient {
    private readonly config;
    private readonly stubAnchors;
    constructor(config?: Partial<AztecConfig>);
    isLiveMode(): boolean;
    getConfig(): AztecConfig;
    anchorProof(request: AnchorRequest): Promise<AnchorResult>;
    verifyProof(proofHash: string): Promise<VerifyResult>;
    getAnchors(query: RegistryQuery): Promise<RegistryResult>;
    private buildSimulatedAnchor;
    private deriveTxHash;
    private deriveBlock;
    private callRpcWithRetry;
    private callRpc;
}
export {};
//# sourceMappingURL=client.d.ts.map
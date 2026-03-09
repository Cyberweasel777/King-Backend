import type { SolanaAnchorMeta, SolanaAnchorRequest, SolanaAnchorResult, SolanaConfig, SolanaRegistryQuery, SolanaRegistryResult, SolanaVerifyResult } from './types';
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
export declare function buildProofInputs(request: SolanaAnchorRequest): ProofInputs;
export declare class SolanaClient {
    private readonly config;
    private readonly anchors;
    private readonly connection;
    private payer;
    constructor(config?: Partial<SolanaConfig>);
    isLiveMode(): boolean;
    getConfig(): SolanaConfig;
    anchorProof(request: SolanaAnchorRequest): Promise<SolanaAnchorResult>;
    verifyProof(proofHash: string, options?: {
        queryChain?: boolean;
    }): Promise<SolanaVerifyResult>;
    getAnchors(query: SolanaRegistryQuery): Promise<SolanaRegistryResult>;
    private buildSimulatedAnchor;
    private deriveStubSignature;
    private deriveStubSlot;
    private callWithRetry;
    private submitMemoTransaction;
    private isSignatureConfirmed;
    private getPayer;
}
export declare function normalizeTxSignature(value: string): string | null;
export declare function normalizeAnchorMeta(value: unknown): SolanaAnchorMeta | null;
export {};
//# sourceMappingURL=client.d.ts.map
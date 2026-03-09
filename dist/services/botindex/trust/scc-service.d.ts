interface UnsignedSCCCertificate {
    certificateId: string;
    agentId: string;
    sessionIndex: string;
    parentHash: string | null;
    memoryRoot: string;
    capabilityHash: string;
    stateHash: string;
    merkleRoot: string;
    timestamp: string;
}
export interface SCCCertificate extends UnsignedSCCCertificate {
    signature: string;
}
export interface AnchorSCCParams {
    agentId: string;
    sessionIndex: string | number;
    parentHash?: string | null;
    memoryRoot: string;
    capabilityHash: string;
    stateHash: string;
}
export interface AnchorSCCResult {
    certificate: SCCCertificate;
    anchorHash: string;
}
export interface VerifyAnchorResult {
    found: boolean;
    certificate?: SCCCertificate;
    anchoredAt?: string;
}
export interface SCCChainGap {
    index: number;
    certificateId: string;
    reason: 'invalid_merkle_root' | 'invalid_signature' | 'parent_hash_mismatch';
    expected?: string;
    actual?: string | null;
}
export interface VerifySCCChainResult {
    valid: boolean;
    chainLength: number;
    gaps: SCCChainGap[];
    firstSession: string;
    lastSession: string;
}
export declare function anchorSCC(params: AnchorSCCParams): AnchorSCCResult;
export declare function verifyAnchor(anchorHash: string): VerifyAnchorResult;
export declare function verifySCCChain(certificates: SCCCertificate[]): VerifySCCChainResult;
export {};
//# sourceMappingURL=scc-service.d.ts.map
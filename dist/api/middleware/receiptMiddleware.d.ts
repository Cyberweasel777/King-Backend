import type { RequestHandler } from 'express';
interface SigningKeyState {
    secretKey: Uint8Array;
    publicKey: Uint8Array;
}
export interface AgentActionReceipt {
    receiptId: string;
    agent: string;
    principal: string;
    action: string;
    scope: string;
    inputHash: string;
    outputHash: string;
    timestamp: string;
    cost: string | number | null;
    signature: string;
}
export interface ReceiptQueryOptions {
    principal?: string;
    from?: string;
    to?: string;
    limit?: number;
}
export declare const TRUST_LAYER_JSON: {
    name: string;
    version: string;
    capabilities: {
        receipts: {
            enabled: boolean;
            signing: string;
            format: string;
            header: string;
            lookup: string;
            export: string;
            pubkey: string;
        };
        provenance: {
            inputHashing: string;
            outputHashing: string;
            timestampSource: string;
        };
    };
    spec: string;
};
export declare function initReceiptSigning(): Promise<void>;
export declare function getReceiptPublicKeyBase64(): string;
export declare function getSigningKeyState(): SigningKeyState;
export declare function getReceiptByIdFromMemory(receiptId: string): AgentActionReceipt | null;
export declare function findReceiptById(receiptId: string): Promise<AgentActionReceipt | null>;
export declare function queryReceipts(options: ReceiptQueryOptions): Promise<AgentActionReceipt[]>;
export declare const receiptMiddleware: RequestHandler;
export {};
//# sourceMappingURL=receiptMiddleware.d.ts.map
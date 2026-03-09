import { AgentActionReceipt } from '../../../api/middleware/receiptMiddleware';
export interface SignAARParams {
    agent: string;
    principal: string;
    action: string;
    scope: string;
    inputData: unknown;
    outputData: unknown;
    cost?: string | number | null;
}
export interface VerifyReceiptResult {
    valid: boolean;
    details: {
        agent?: string;
        action?: string;
        timestamp?: string;
        inputHash?: string;
        outputHash?: string;
        message?: string;
    };
}
export declare function signReceipt(params: SignAARParams): AgentActionReceipt;
export declare function verifyReceipt(receipt: AgentActionReceipt, publicKey?: string): VerifyReceiptResult;
//# sourceMappingURL=aar-service.d.ts.map
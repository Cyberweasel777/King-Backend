export interface AnchorRequest {
  receipt: Record<string, unknown>;
  authorizedKeys: string[];
  timestampWindow: {
    min: string | number;
    max: string | number;
  };
}

export interface AnchorResult {
  proofHash: string;
  txHash: string;
  aztecBlock: number;
  anchorId: string;
  timestamp: string;
  receiptHash: string;
  authorizedKeysHash: string;
  timestampWindowHash: string;
  proofInputHash: string;
}

export interface AnchorMeta {
  proofHash: string;
  txHash: string;
  block: number;
  timestamp: string;
  anchorId: string;
}

export interface VerifyResult {
  verified: boolean;
  anchorMeta: Pick<AnchorMeta, 'block' | 'timestamp' | 'anchorId'> | null;
}

export interface RegistryQuery {
  limit: number;
  offset: number;
  since?: string;
}

export interface RegistryResult {
  total: number;
  anchors: AnchorMeta[];
  hasMore: boolean;
}

export interface AztecConfig {
  rpcUrl: string;
  live: boolean;
  timeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
}

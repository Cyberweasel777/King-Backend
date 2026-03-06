export type HashAlgorithm = 'sha256' | 'sha384' | 'sha512' | 'blake3';

export interface HashObject {
  alg: HashAlgorithm;
  digest: string;
}

export type PrincipalType = 'user' | 'organization' | 'service' | 'agent' | 'other';
export type ActionStatus = 'success' | 'failure' | 'partial';

export interface AgentIdentity {
  id: string;
  name?: string;
  version?: string;
  publicKey?: string;
  [key: string]: unknown;
}

export interface Principal {
  id: string;
  type: PrincipalType;
  [key: string]: unknown;
}

export interface Action {
  type: string;
  target: string;
  method?: string;
  status: ActionStatus;
  [key: string]: unknown;
}

export interface Scope {
  permissions: string[];
  constraints?: Record<string, unknown>;
  x402?: {
    paymentId?: string;
    network?: string;
    asset?: string;
    amount?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface Cost {
  amount: string;
  currency: string;
  unit?: string;
  payer?: string;
  [key: string]: unknown;
}

export interface Signature {
  alg: 'Ed25519';
  kid: string;
  publicKey?: string;
  canonicalization: 'JCS-SORTED-UTF8-NOWS';
  sig: string;
}

export interface UnsignedSignature {
  alg: 'Ed25519';
  kid: string;
  publicKey?: string;
  canonicalization: 'JCS-SORTED-UTF8-NOWS';
  sig?: string;
}

export interface AARReceipt {
  receiptId: string;
  agent: AgentIdentity;
  principal: Principal;
  action: Action;
  scope: Scope;
  inputHash: HashObject;
  outputHash: HashObject;
  timestamp: string;
  cost: Cost;
  signature: Signature;
  metadata: Record<string, unknown>;
}

export interface UnsignedReceipt extends Omit<AARReceipt, 'signature'> {
  signature: UnsignedSignature;
}

export interface CreateReceiptOptions {
  receiptId?: string;
  timestamp?: string;
  agent: AgentIdentity;
  principal: Principal;
  action: Action;
  scope: Scope;
  inputHash: HashObject;
  outputHash: HashObject;
  cost: Cost;
  metadata?: Record<string, unknown>;
  signature?: Partial<UnsignedSignature> & Pick<UnsignedSignature, 'kid'>;
}

export interface VerifyResult {
  ok: boolean;
  reason?: string;
}

export interface KeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export interface WellKnownAARConfiguration {
  specVersion: string;
  canonicalization: 'JCS-SORTED-UTF8-NOWS';
  signatureAlgorithms: ['Ed25519'];
  hashAlgorithms: ['sha256'];
  receiptHeader: string;
  agent: {
    id: string;
    name?: string;
    version?: string;
    publicKey: string;
  };
}

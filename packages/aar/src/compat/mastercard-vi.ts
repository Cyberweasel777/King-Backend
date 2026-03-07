import type { AARReceipt } from '../types';

/**
 * Mastercard Verifiable Intent record structure.
 * Based on the March 5, 2026 open-source specification.
 *
 * Verifiable Intent links identity, intent, and action into a single
 * privacy-preserving, tamper-resistant record for agentic commerce.
 */
export interface VerifiableIntentRecord {
  /** Unique record identifier */
  recordId: string;
  /** Identity of the consumer/principal */
  identity: {
    id: string;
    type: string;
    verificationMethod?: string;
  };
  /** Original intent / instruction from the principal */
  intent: {
    description: string;
    permissions: string[];
    constraints?: Record<string, unknown>;
    timestamp: string;
  };
  /** Action taken by the agent */
  action: {
    agentId: string;
    agentName?: string;
    type: string;
    target: string;
    method?: string;
    status: string;
    timestamp: string;
  };
  /** Outcome / evidence */
  outcome: {
    inputDigest: string;
    outputDigest: string;
    cost?: {
      amount: string;
      currency: string;
    };
  };
  /** Cryptographic proof */
  proof: {
    algorithm: string;
    keyId: string;
    publicKey?: string;
    signature: string;
    canonicalization: string;
  };
  /** Selective disclosure flags */
  disclosure: {
    mode: 'minimal' | 'full';
    redactedFields?: string[];
  };
  /** Extension metadata */
  metadata: Record<string, unknown>;
}

/**
 * Convert an AAR receipt to Mastercard Verifiable Intent format.
 */
export function aarToVerifiableIntent(receipt: AARReceipt): VerifiableIntentRecord {
  return {
    recordId: receipt.receiptId,
    identity: {
      id: receipt.principal.id,
      type: receipt.principal.type,
    },
    intent: {
      description: `${receipt.action.type} on ${receipt.action.target}`,
      permissions: [...receipt.scope.permissions],
      constraints: receipt.scope.constraints,
      timestamp: receipt.timestamp,
    },
    action: {
      agentId: receipt.agent.id,
      agentName: receipt.agent.name,
      type: receipt.action.type,
      target: receipt.action.target,
      method: receipt.action.method,
      status: receipt.action.status,
      timestamp: receipt.timestamp,
    },
    outcome: {
      inputDigest: `${receipt.inputHash.alg}:${receipt.inputHash.digest}`,
      outputDigest: `${receipt.outputHash.alg}:${receipt.outputHash.digest}`,
      cost: {
        amount: receipt.cost.amount,
        currency: receipt.cost.currency,
      },
    },
    proof: {
      algorithm: receipt.signature.alg,
      keyId: receipt.signature.kid,
      publicKey: receipt.signature.publicKey,
      signature: receipt.signature.sig,
      canonicalization: receipt.signature.canonicalization,
    },
    disclosure: {
      mode: 'minimal',
      redactedFields: ['inputHash.raw', 'outputHash.raw'],
    },
    metadata: { ...receipt.metadata, aarVersion: '1.0' },
  };
}

/**
 * Convert a Verifiable Intent record to a partial AAR receipt.
 * Note: some fields may need supplementing for full AAR compliance.
 */
export function verifiableIntentToAAR(vi: VerifiableIntentRecord): Partial<AARReceipt> {
  const [inputAlg = 'sha256', inputDigest = ''] = vi.outcome.inputDigest.split(':', 2);
  const [outputAlg = 'sha256', outputDigest = ''] = vi.outcome.outputDigest.split(':', 2);

  return {
    receiptId: vi.recordId,
    agent: {
      id: vi.action.agentId,
      name: vi.action.agentName,
    },
    principal: {
      id: vi.identity.id,
      type: vi.identity.type as 'user' | 'organization' | 'service' | 'agent' | 'other',
    },
    action: {
      type: vi.action.type,
      target: vi.action.target,
      method: vi.action.method,
      status: vi.action.status as 'success' | 'failure' | 'partial',
    },
    scope: {
      permissions: [...vi.intent.permissions],
      constraints: vi.intent.constraints,
    },
    inputHash: {
      alg: inputAlg as 'sha256',
      digest: inputDigest,
    },
    outputHash: {
      alg: outputAlg as 'sha256',
      digest: outputDigest,
    },
    timestamp: vi.action.timestamp,
    cost: vi.outcome.cost
      ? { amount: vi.outcome.cost.amount, currency: vi.outcome.cost.currency }
      : { amount: '0', currency: 'USD' },
    signature: {
      alg: vi.proof.algorithm as 'Ed25519',
      kid: vi.proof.keyId,
      publicKey: vi.proof.publicKey,
      canonicalization: vi.proof.canonicalization as 'JCS-SORTED-UTF8-NOWS',
      sig: vi.proof.signature,
    },
    metadata: { ...vi.metadata, sourceFormat: 'verifiable-intent' },
  };
}

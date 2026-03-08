import crypto from 'crypto';
import nacl from 'tweetnacl';
import {
  AgentActionReceipt,
  getReceiptPublicKeyBase64,
  getSigningKeyState,
} from '../../../api/middleware/receiptMiddleware';

type CanonicalValue =
  | null
  | string
  | number
  | boolean
  | CanonicalValue[]
  | { [key: string]: CanonicalValue };

interface UnsignedAgentActionReceipt {
  receiptId: string;
  agent: string;
  principal: string;
  action: string;
  scope: string;
  inputHash: string;
  outputHash: string;
  timestamp: string;
  cost: string | number | null;
}

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

function toCanonicalValue(input: unknown): CanonicalValue | undefined {
  if (input === undefined) return undefined;
  if (input === null) return null;

  if (typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean') {
    return input;
  }

  if (typeof input === 'bigint') {
    return input.toString();
  }

  if (Buffer.isBuffer(input)) {
    return input.toString('base64');
  }

  if (input instanceof Uint8Array) {
    return Buffer.from(input).toString('base64');
  }

  if (input instanceof Date) {
    return input.toISOString();
  }

  if (Array.isArray(input)) {
    const arr: CanonicalValue[] = [];
    for (const item of input) {
      const normalized = toCanonicalValue(item);
      if (normalized !== undefined) {
        arr.push(normalized);
      }
    }
    return arr;
  }

  if (typeof input === 'object') {
    const out: { [key: string]: CanonicalValue } = {};
    const obj = input as Record<string, unknown>;
    for (const key of Object.keys(obj).sort()) {
      const normalized = toCanonicalValue(obj[key]);
      if (normalized !== undefined) {
        out[key] = normalized;
      }
    }
    return out;
  }

  return String(input);
}

function canonicalStringify(value: unknown): string {
  const normalized = toCanonicalValue(value);
  return JSON.stringify(normalized ?? null);
}

function sha256Hex(value: string | Buffer): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function signDetachedPayload(payload: string): string {
  const { secretKey } = getSigningKeyState();
  const signature = nacl.sign.detached(Buffer.from(payload, 'utf-8'), secretKey);
  return Buffer.from(signature).toString('base64');
}

function resolvePublicKey(publicKey?: string): Uint8Array | null {
  const keyBase64 = publicKey?.trim() || getReceiptPublicKeyBase64();
  try {
    const decoded = Buffer.from(keyBase64, 'base64');
    if (decoded.length !== nacl.sign.publicKeyLength) {
      return null;
    }
    return new Uint8Array(decoded);
  } catch {
    return null;
  }
}

function parseSignature(signatureBase64: string): Uint8Array | null {
  try {
    const decoded = Buffer.from(signatureBase64, 'base64');
    if (decoded.length !== nacl.sign.signatureLength) {
      return null;
    }
    return new Uint8Array(decoded);
  } catch {
    return null;
  }
}

function toUnsignedReceipt(receipt: AgentActionReceipt): UnsignedAgentActionReceipt {
  return {
    receiptId: receipt.receiptId,
    agent: receipt.agent,
    principal: receipt.principal,
    action: receipt.action,
    scope: receipt.scope,
    inputHash: receipt.inputHash,
    outputHash: receipt.outputHash,
    timestamp: receipt.timestamp,
    cost: receipt.cost,
  };
}

function hasReceiptShape(receipt: AgentActionReceipt): boolean {
  const isCostValid =
    receipt.cost === null || typeof receipt.cost === 'string' || typeof receipt.cost === 'number';

  return (
    typeof receipt.receiptId === 'string' &&
    typeof receipt.agent === 'string' &&
    typeof receipt.principal === 'string' &&
    typeof receipt.action === 'string' &&
    typeof receipt.scope === 'string' &&
    typeof receipt.inputHash === 'string' &&
    typeof receipt.outputHash === 'string' &&
    typeof receipt.timestamp === 'string' &&
    typeof receipt.signature === 'string' &&
    isCostValid
  );
}

export function signReceipt(params: SignAARParams): AgentActionReceipt {
  const unsignedReceipt: UnsignedAgentActionReceipt = {
    receiptId: crypto.randomUUID(),
    agent: params.agent,
    principal: params.principal,
    action: params.action,
    scope: params.scope,
    inputHash: sha256Hex(canonicalStringify(params.inputData)),
    outputHash: sha256Hex(canonicalStringify(params.outputData)),
    timestamp: new Date().toISOString(),
    cost: params.cost ?? null,
  };

  return {
    ...unsignedReceipt,
    signature: signDetachedPayload(canonicalStringify(unsignedReceipt)),
  };
}

export function verifyReceipt(receipt: AgentActionReceipt, publicKey?: string): VerifyReceiptResult {
  const details = {
    agent: receipt?.agent,
    action: receipt?.action,
    timestamp: receipt?.timestamp,
    inputHash: receipt?.inputHash,
    outputHash: receipt?.outputHash,
  };

  if (!hasReceiptShape(receipt)) {
    return {
      valid: false,
      details: { ...details, message: 'Receipt payload is missing required fields' },
    };
  }

  const verifierPublicKey = resolvePublicKey(publicKey);
  if (!verifierPublicKey) {
    return {
      valid: false,
      details: { ...details, message: 'Invalid Ed25519 public key' },
    };
  }

  const signature = parseSignature(receipt.signature);
  if (!signature) {
    return {
      valid: false,
      details: { ...details, message: 'Invalid signature encoding' },
    };
  }

  const payload = Buffer.from(canonicalStringify(toUnsignedReceipt(receipt)), 'utf-8');
  const valid = nacl.sign.detached.verify(new Uint8Array(payload), signature, verifierPublicKey);

  return {
    valid,
    details,
  };
}

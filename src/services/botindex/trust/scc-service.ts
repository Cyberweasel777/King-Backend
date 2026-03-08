import crypto from 'crypto';
import nacl from 'tweetnacl';
import { getReceiptPublicKeyBase64, getSigningKeyState } from '../../../api/middleware/receiptMiddleware';

const MAX_SCC_ANCHORS = 100_000;

type CanonicalValue =
  | null
  | string
  | number
  | boolean
  | CanonicalValue[]
  | { [key: string]: CanonicalValue };

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

type StoredAnchor = {
  anchorHash: string;
  certificate: SCCCertificate;
  anchoredAt: string;
};

const anchorStore = new Map<string, StoredAnchor>();

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

function merkleRoot(leaves: string[]): string {
  if (leaves.length === 0) return sha256Hex('');

  let level = leaves.map((leaf) => sha256Hex(leaf));
  while (level.length > 1) {
    const next: string[] = [];
    for (let idx = 0; idx < level.length; idx += 2) {
      const left = level[idx];
      const right = level[idx + 1] ?? left;
      next.push(sha256Hex(`${left}${right}`));
    }
    level = next;
  }

  return level[0];
}

function signCertificate(unsignedCert: UnsignedSCCCertificate): string {
  const { secretKey } = getSigningKeyState();
  const payload = Buffer.from(canonicalStringify(unsignedCert), 'utf-8');
  const signature = nacl.sign.detached(new Uint8Array(payload), secretKey);
  return Buffer.from(signature).toString('base64');
}

function computeAnchorHash(certificateId: string, timestamp: string, root: string): string {
  return sha256Hex(`${certificateId}${timestamp}${root}`);
}

function touchAnchor(anchorHash: string, value: StoredAnchor): void {
  if (anchorStore.has(anchorHash)) {
    anchorStore.delete(anchorHash);
  }
  anchorStore.set(anchorHash, value);
}

function setAnchor(anchorHash: string, value: StoredAnchor): void {
  touchAnchor(anchorHash, value);
  while (anchorStore.size > MAX_SCC_ANCHORS) {
    const oldest = anchorStore.keys().next().value as string | undefined;
    if (!oldest) break;
    anchorStore.delete(oldest);
  }
}

function toUnsignedCertificate(certificate: SCCCertificate): UnsignedSCCCertificate {
  return {
    certificateId: certificate.certificateId,
    agentId: certificate.agentId,
    sessionIndex: certificate.sessionIndex,
    parentHash: certificate.parentHash,
    memoryRoot: certificate.memoryRoot,
    capabilityHash: certificate.capabilityHash,
    stateHash: certificate.stateHash,
    merkleRoot: certificate.merkleRoot,
    timestamp: certificate.timestamp,
  };
}

function verifyCertificateSignature(certificate: SCCCertificate, publicKey?: string): boolean {
  try {
    const keyBase64 = publicKey?.trim() || getReceiptPublicKeyBase64();
    const key = Buffer.from(keyBase64, 'base64');
    if (key.length !== nacl.sign.publicKeyLength) {
      return false;
    }

    const signature = Buffer.from(certificate.signature, 'base64');
    if (signature.length !== nacl.sign.signatureLength) {
      return false;
    }

    const payload = Buffer.from(canonicalStringify(toUnsignedCertificate(certificate)), 'utf-8');
    return nacl.sign.detached.verify(
      new Uint8Array(payload),
      new Uint8Array(signature),
      new Uint8Array(key)
    );
  } catch {
    return false;
  }
}

export function anchorSCC(params: AnchorSCCParams): AnchorSCCResult {
  const certificateId = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const parentHash = params.parentHash?.trim() || null;
  const root = merkleRoot([params.memoryRoot, params.capabilityHash, params.stateHash]);

  const unsignedCertificate: UnsignedSCCCertificate = {
    certificateId,
    agentId: params.agentId,
    sessionIndex: String(params.sessionIndex),
    parentHash,
    memoryRoot: params.memoryRoot,
    capabilityHash: params.capabilityHash,
    stateHash: params.stateHash,
    merkleRoot: root,
    timestamp,
  };

  const certificate: SCCCertificate = {
    ...unsignedCertificate,
    signature: signCertificate(unsignedCertificate),
  };

  const anchorHash = computeAnchorHash(certificate.certificateId, certificate.timestamp, certificate.merkleRoot);
  setAnchor(anchorHash, {
    anchorHash,
    certificate,
    anchoredAt: timestamp,
  });

  return {
    certificate,
    anchorHash,
  };
}

export function verifyAnchor(anchorHash: string): VerifyAnchorResult {
  const normalized = anchorHash.trim();
  if (!normalized) {
    return { found: false };
  }

  const found = anchorStore.get(normalized);
  if (!found) {
    return { found: false };
  }

  touchAnchor(normalized, found);
  return {
    found: true,
    certificate: found.certificate,
    anchoredAt: found.anchoredAt,
  };
}

export function verifySCCChain(certificates: SCCCertificate[]): VerifySCCChainResult {
  const gaps: SCCChainGap[] = [];

  for (let idx = 0; idx < certificates.length; idx += 1) {
    const certificate = certificates[idx];
    const expectedMerkleRoot = merkleRoot([
      certificate.memoryRoot,
      certificate.capabilityHash,
      certificate.stateHash,
    ]);
    if (certificate.merkleRoot !== expectedMerkleRoot) {
      gaps.push({
        index: idx,
        certificateId: certificate.certificateId,
        reason: 'invalid_merkle_root',
        expected: expectedMerkleRoot,
        actual: certificate.merkleRoot,
      });
    }

    if (!verifyCertificateSignature(certificate)) {
      gaps.push({
        index: idx,
        certificateId: certificate.certificateId,
        reason: 'invalid_signature',
      });
    }

    if (idx > 0) {
      const previous = certificates[idx - 1];
      const expectedParent = computeAnchorHash(
        previous.certificateId,
        previous.timestamp,
        previous.merkleRoot
      );
      if (certificate.parentHash !== expectedParent) {
        gaps.push({
          index: idx,
          certificateId: certificate.certificateId,
          reason: 'parent_hash_mismatch',
          expected: expectedParent,
          actual: certificate.parentHash,
        });
      }
    }
  }

  return {
    valid: certificates.length > 0 && gaps.length === 0,
    chainLength: certificates.length,
    gaps,
    firstSession: certificates[0] ? String(certificates[0].sessionIndex) : '',
    lastSession: certificates[certificates.length - 1]
      ? String(certificates[certificates.length - 1].sessionIndex)
      : '',
  };
}

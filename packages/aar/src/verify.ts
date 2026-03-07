import nacl from 'tweetnacl';
import { canonicalizeForSigning } from './canonicalize';
import { decodeBase64Url, utf8Encode } from './encoding';
import type { AARReceipt, VerifyResult } from './types';

function shapeError(receipt: AARReceipt): string | null {
  if (!receipt.receiptId) return 'missing required field: receiptId';
  if (!receipt.agent?.id) return 'missing required field: agent.id';
  if (!receipt.principal?.id || !receipt.principal?.type) return 'missing required field: principal';
  if (!receipt.action?.type || !receipt.action?.target || !receipt.action?.status) return 'missing required field: action';
  if (!receipt.scope?.permissions?.length) return 'missing required field: scope.permissions';
  if (!receipt.inputHash?.digest || !receipt.outputHash?.digest) return 'missing required field: hash objects';
  if (!receipt.signature?.sig) return 'missing signature.sig';
  if (receipt.signature.alg !== 'Ed25519') return 'unsupported signature.alg';
  if (receipt.signature.canonicalization !== 'JCS-SORTED-UTF8-NOWS') return 'unsupported canonicalization';
  return null;
}

function resolvePublicKey(receipt: AARReceipt, explicit?: Uint8Array | string): Uint8Array | null {
  if (explicit instanceof Uint8Array) return explicit;
  if (typeof explicit === 'string' && explicit.length > 0) return decodeBase64Url(explicit);
  if (receipt.signature.publicKey) return decodeBase64Url(receipt.signature.publicKey);
  if (receipt.agent.publicKey) return decodeBase64Url(receipt.agent.publicKey);
  return null;
}

export function verifyReceipt(receipt: AARReceipt, publicKey?: Uint8Array | string): VerifyResult {
  const err = shapeError(receipt);
  if (err) return { ok: false, reason: err };

  try {
    const key = resolvePublicKey(receipt, publicKey);
    if (!key) return { ok: false, reason: 'no public key provided' };
    if (key.length !== nacl.sign.publicKeyLength) return { ok: false, reason: 'invalid public key length' };

    const sig = decodeBase64Url(receipt.signature.sig);
    if (sig.length !== nacl.sign.signatureLength) return { ok: false, reason: 'invalid signature length' };

    const msg = utf8Encode(canonicalizeForSigning(receipt));
    const ok = nacl.sign.detached.verify(msg, sig, key);
    return ok ? { ok: true } : { ok: false, reason: 'signature verification failed' };
  } catch (e) {
    const reason = e instanceof Error ? e.message : 'verification error';
    return { ok: false, reason };
  }
}

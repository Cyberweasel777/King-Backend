import nacl from 'tweetnacl';
import { canonicalizeForSigning } from './canonicalize';
import { decodeBase64, decodeBase64Url, encodeBase64Url, utf8Encode } from './encoding';
import type { AARReceipt, KeyPair, UnsignedReceipt } from './types';

function sanitizePem(pem: string): string {
  return pem
    .replace(/-----BEGIN[^-]+-----/g, '')
    .replace(/-----END[^-]+-----/g, '')
    .replace(/\s+/g, '');
}

export function generateKeyPair(): KeyPair {
  const kp = nacl.sign.keyPair();
  return { publicKey: kp.publicKey, secretKey: kp.secretKey };
}

export function loadSecretKey(input: Uint8Array | string): Uint8Array {
  let raw: Uint8Array;

  if (input instanceof Uint8Array) {
    raw = input;
  } else if (input.includes('-----BEGIN')) {
    raw = decodeBase64(sanitizePem(input));
  } else {
    try {
      raw = decodeBase64Url(input);
    } catch {
      raw = decodeBase64(input);
    }
  }

  if (raw.length === nacl.sign.secretKeyLength) {
    return raw;
  }

  if (raw.length === nacl.sign.seedLength) {
    return nacl.sign.keyPair.fromSeed(raw).secretKey;
  }

  throw new Error('Secret key must be 32-byte seed or 64-byte Ed25519 secret key');
}

export function publicKeyFromSecret(secretKey: Uint8Array | string): Uint8Array {
  const sk = loadSecretKey(secretKey);
  return nacl.sign.keyPair.fromSecretKey(sk).publicKey;
}

export function signReceipt(unsigned: UnsignedReceipt, secretKey: Uint8Array | string): AARReceipt {
  const sk = loadSecretKey(secretKey);
  const withDefaults: UnsignedReceipt = {
    ...unsigned,
    signature: {
      ...unsigned.signature,
      alg: 'Ed25519',
      canonicalization: 'JCS-SORTED-UTF8-NOWS',
      publicKey:
        unsigned.signature.publicKey ?? encodeBase64Url(publicKeyFromSecret(sk))
    }
  };

  const payload = utf8Encode(canonicalizeForSigning(withDefaults));
  const sig = nacl.sign.detached(payload, sk);

  return {
    ...withDefaults,
    signature: {
      ...withDefaults.signature,
      sig: encodeBase64Url(sig)
    }
  };
}

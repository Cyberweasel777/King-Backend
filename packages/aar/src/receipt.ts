import { encodeBase64, utf8Encode } from './encoding';
import { signReceipt } from './sign';
import type { AARReceipt, CreateReceiptOptions, UnsignedReceipt } from './types';

function createReceiptId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }

  bytes[6] = ((bytes[6] as number) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createReceipt(opts: CreateReceiptOptions): UnsignedReceipt {
  return {
    receiptId: opts.receiptId ?? createReceiptId(),
    agent: opts.agent,
    principal: opts.principal,
    action: opts.action,
    scope: opts.scope,
    inputHash: opts.inputHash,
    outputHash: opts.outputHash,
    timestamp: opts.timestamp ?? new Date().toISOString(),
    cost: opts.cost,
    signature: {
      alg: 'Ed25519',
      canonicalization: 'JCS-SORTED-UTF8-NOWS',
      kid: opts.signature?.kid ?? `${opts.agent.id}#key-1`,
      publicKey: opts.signature?.publicKey,
      sig: opts.signature?.sig
    },
    metadata: opts.metadata ?? {}
  };
}

export function signAndFinalize(unsigned: UnsignedReceipt, secretKey: Uint8Array): AARReceipt {
  return signReceipt(unsigned, secretKey);
}

export function encodeReceiptHeader(receipt: AARReceipt): string {
  return encodeBase64(utf8Encode(JSON.stringify(receipt)));
}

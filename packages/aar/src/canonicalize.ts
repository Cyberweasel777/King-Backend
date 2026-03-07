import type { AARReceipt, UnsignedReceipt } from './types';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }

  if (!isObject(value)) {
    return value;
  }

  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = sortKeysDeep(value[key]);
  }
  return sorted;
}

export function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function toSignableReceipt(receipt: AARReceipt | UnsignedReceipt): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(receipt)) as Record<string, unknown>;
  const signature = clone.signature;

  if (!isObject(signature)) {
    throw new Error('Invalid receipt.signature');
  }

  delete signature.sig;
  clone.signature = signature;
  return clone;
}

export function canonicalizeForSigning(receipt: AARReceipt | UnsignedReceipt): string {
  return canonicalize(toSignableReceipt(receipt));
}

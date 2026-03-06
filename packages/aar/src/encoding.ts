const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const BASE64_LOOKUP: Record<string, number> = Object.create(null) as Record<string, number>;
for (let i = 0; i < BASE64_ALPHABET.length; i += 1) {
  BASE64_LOOKUP[BASE64_ALPHABET[i] as string] = i;
}

export function utf8Encode(input: string): Uint8Array {
  return new TextEncoder().encode(input);
}

export function utf8Decode(input: Uint8Array): string {
  return new TextDecoder().decode(input);
}

export function encodeBase64(bytes: Uint8Array): string {
  let out = '';

  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0;
    const b1 = bytes[i + 1] ?? 0;
    const b2 = bytes[i + 2] ?? 0;
    const n = (b0 << 16) | (b1 << 8) | b2;

    out += BASE64_ALPHABET[(n >> 18) & 63] as string;
    out += BASE64_ALPHABET[(n >> 12) & 63] as string;
    out += i + 1 < bytes.length ? (BASE64_ALPHABET[(n >> 6) & 63] as string) : '=';
    out += i + 2 < bytes.length ? (BASE64_ALPHABET[n & 63] as string) : '=';
  }

  return out;
}

export function decodeBase64(base64: string): Uint8Array {
  const clean = base64.replace(/\s+/g, '');
  if (clean.length % 4 !== 0) {
    throw new Error('Invalid base64 length');
  }

  const out: number[] = [];

  for (let i = 0; i < clean.length; i += 4) {
    const c0 = clean[i] as string;
    const c1 = clean[i + 1] as string;
    const c2 = clean[i + 2] as string;
    const c3 = clean[i + 3] as string;

    const v0 = BASE64_LOOKUP[c0];
    const v1 = BASE64_LOOKUP[c1];
    const v2 = c2 === '=' ? 0 : BASE64_LOOKUP[c2];
    const v3 = c3 === '=' ? 0 : BASE64_LOOKUP[c3];

    if (v0 === undefined || v1 === undefined || (c2 !== '=' && v2 === undefined) || (c3 !== '=' && v3 === undefined)) {
      throw new Error('Invalid base64 input');
    }

    const n = (v0 << 18) | (v1 << 12) | (v2 << 6) | v3;
    out.push((n >> 16) & 255);
    if (c2 !== '=') out.push((n >> 8) & 255);
    if (c3 !== '=') out.push(n & 255);
  }

  return new Uint8Array(out);
}

export function encodeBase64Url(bytes: Uint8Array): string {
  return encodeBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function decodeBase64Url(input: string): Uint8Array {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - (base64.length % 4)) % 4;
  return decodeBase64(base64 + '='.repeat(pad));
}

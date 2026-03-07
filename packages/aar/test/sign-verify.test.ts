import { describe, it, expect } from 'vitest';
import { generateKeyPair, signReceipt, publicKeyFromSecret } from '../src/sign';
import { verifyReceipt } from '../src/verify';
import { createReceipt } from '../src/receipt';
import { hashInput, hashOutput } from '../src/hash';
import { encodeBase64Url } from '../src/encoding';

function makeUnsigned() {
  return createReceipt({
    agent: { id: 'test-agent/v1', name: 'TestAgent', version: '1.0.0' },
    principal: { id: 'user:alice', type: 'user' },
    action: { type: 'api.call', target: '/test', method: 'GET', status: 'success' },
    scope: { permissions: ['read:test'] },
    inputHash: hashInput({ query: 'test' }),
    outputHash: hashOutput('{"result":"ok"}'),
    cost: { amount: '0.01', currency: 'USDC' },
  });
}

describe('sign and verify', () => {
  it('round-trips: sign then verify', () => {
    const { secretKey } = generateKeyPair();
    const unsigned = makeUnsigned();
    const signed = signReceipt(unsigned, secretKey);

    expect(signed.signature.sig).toBeTruthy();
    expect(signed.signature.alg).toBe('Ed25519');

    const result = verifyReceipt(signed);
    expect(result.ok).toBe(true);
  });

  it('fails verification with wrong key', () => {
    const kp1 = generateKeyPair();
    const kp2 = generateKeyPair();
    const unsigned = makeUnsigned();
    const signed = signReceipt(unsigned, kp1.secretKey);

    const result = verifyReceipt(signed, kp2.publicKey);
    expect(result.ok).toBe(false);
  });

  it('fails verification with tampered receipt', () => {
    const { secretKey } = generateKeyPair();
    const unsigned = makeUnsigned();
    const signed = signReceipt(unsigned, secretKey);

    signed.action.status = 'failure';
    const result = verifyReceipt(signed);
    expect(result.ok).toBe(false);
  });

  it('embeds public key in signature', () => {
    const { secretKey, publicKey } = generateKeyPair();
    const unsigned = makeUnsigned();
    const signed = signReceipt(unsigned, secretKey);

    expect(signed.signature.publicKey).toBe(encodeBase64Url(publicKey));
  });
});

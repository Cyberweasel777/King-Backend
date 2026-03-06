import { describe, it, expect } from 'vitest';
import { createReceipt, signAndFinalize, encodeReceiptHeader } from '../src/receipt';
import { generateKeyPair } from '../src/sign';
import { hashInput, hashOutput } from '../src/hash';

describe('createReceipt', () => {
  it('produces a valid unsigned receipt with all required fields', () => {
    const unsigned = createReceipt({
      agent: { id: 'bot/v1' },
      principal: { id: 'user:bob', type: 'user' },
      action: { type: 'trade.execute', target: 'binance/BTCUSDT', method: 'POST', status: 'success' },
      scope: { permissions: ['trade.spot'] },
      inputHash: hashInput({ pair: 'BTCUSDT', side: 'buy' }),
      outputHash: hashOutput('{"orderId":"123"}'),
      cost: { amount: '0.02', currency: 'USDC' },
    });

    expect(unsigned.receiptId).toMatch(/^[0-9a-f]{8}-/);
    expect(unsigned.agent.id).toBe('bot/v1');
    expect(unsigned.principal.type).toBe('user');
    expect(unsigned.action.status).toBe('success');
    expect(unsigned.scope.permissions).toEqual(['trade.spot']);
    expect(unsigned.inputHash.alg).toBe('sha256');
    expect(unsigned.outputHash.alg).toBe('sha256');
    expect(unsigned.cost.amount).toBe('0.02');
    expect(unsigned.signature.alg).toBe('Ed25519');
    expect(unsigned.signature.canonicalization).toBe('JCS-SORTED-UTF8-NOWS');
    expect(unsigned.metadata).toEqual({});
  });

  it('allows custom receiptId and timestamp', () => {
    const unsigned = createReceipt({
      receiptId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      timestamp: '2026-03-06T12:00:00.000Z',
      agent: { id: 'bot/v1' },
      principal: { id: 'user:x', type: 'service' },
      action: { type: 'api.call', target: '/health', status: 'success' },
      scope: { permissions: ['read'] },
      inputHash: hashInput({}),
      outputHash: hashOutput('ok'),
      cost: { amount: '0', currency: 'USD' },
    });

    expect(unsigned.receiptId).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    expect(unsigned.timestamp).toBe('2026-03-06T12:00:00.000Z');
  });
});

describe('signAndFinalize', () => {
  it('returns a signed receipt', () => {
    const { secretKey } = generateKeyPair();
    const unsigned = createReceipt({
      agent: { id: 'bot/v1' },
      principal: { id: 'u', type: 'user' },
      action: { type: 'test', target: '/', status: 'success' },
      scope: { permissions: ['*'] },
      inputHash: hashInput(null),
      outputHash: hashOutput(''),
      cost: { amount: '0', currency: 'USD' },
    });

    const signed = signAndFinalize(unsigned, secretKey);
    expect(signed.signature.sig).toBeTruthy();
    expect(typeof signed.signature.sig).toBe('string');
    expect(signed.signature.sig.length).toBeGreaterThan(10);
  });
});

describe('encodeReceiptHeader', () => {
  it('produces a base64 string', () => {
    const { secretKey } = generateKeyPair();
    const unsigned = createReceipt({
      agent: { id: 'bot/v1' },
      principal: { id: 'u', type: 'user' },
      action: { type: 'test', target: '/', status: 'success' },
      scope: { permissions: ['*'] },
      inputHash: hashInput(null),
      outputHash: hashOutput(''),
      cost: { amount: '0', currency: 'USD' },
    });
    const signed = signAndFinalize(unsigned, secretKey);
    const header = encodeReceiptHeader(signed);
    expect(typeof header).toBe('string');
    expect(header.length).toBeGreaterThan(50);
  });
});

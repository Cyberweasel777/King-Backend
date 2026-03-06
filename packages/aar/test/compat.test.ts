import { describe, it, expect } from 'vitest';
import { generateKeyPair } from '../src/sign';
import { createReceipt, signAndFinalize } from '../src/receipt';
import { hashInput, hashOutput } from '../src/hash';
import { aarToVerifiableIntent, verifiableIntentToAAR } from '../src/compat/mastercard-vi';

function makeSignedReceipt() {
  const { secretKey } = generateKeyPair();
  const unsigned = createReceipt({
    agent: { id: 'payment-agent/v1', name: 'PaymentBot' },
    principal: { id: 'user:alice', type: 'user' },
    action: { type: 'payment.execute', target: 'stripe/checkout', method: 'POST', status: 'success' },
    scope: { permissions: ['payment.create'] },
    inputHash: hashInput({ amount: 100, currency: 'USD' }),
    outputHash: hashOutput('{"paymentId":"pi_123"}'),
    cost: { amount: '100.00', currency: 'USD' },
    metadata: { orderId: 'order_456' },
  });
  return signAndFinalize(unsigned, secretKey);
}

describe('Mastercard Verifiable Intent compatibility', () => {
  it('converts AAR to Verifiable Intent format', () => {
    const receipt = makeSignedReceipt();
    const vi = aarToVerifiableIntent(receipt);

    expect(vi.recordId).toBe(receipt.receiptId);
    expect(vi.identity.id).toBe('user:alice');
    expect(vi.identity.type).toBe('user');
    expect(vi.intent.permissions).toEqual(['payment.create']);
    expect(vi.action.agentId).toBe('payment-agent/v1');
    expect(vi.action.type).toBe('payment.execute');
    expect(vi.action.status).toBe('success');
    expect(vi.outcome.cost?.amount).toBe('100.00');
    expect(vi.proof.algorithm).toBe('Ed25519');
    expect(vi.proof.signature).toBe(receipt.signature.sig);
    expect(vi.disclosure.mode).toBe('minimal');
    expect(vi.metadata.aarVersion).toBe('1.0');
  });

  it('converts Verifiable Intent back to partial AAR', () => {
    const receipt = makeSignedReceipt();
    const vi = aarToVerifiableIntent(receipt);
    const partial = verifiableIntentToAAR(vi);

    expect(partial.receiptId).toBe(receipt.receiptId);
    expect(partial.agent?.id).toBe('payment-agent/v1');
    expect(partial.principal?.id).toBe('user:alice');
    expect(partial.action?.type).toBe('payment.execute');
    expect(partial.signature?.sig).toBe(receipt.signature.sig);
    expect(partial.metadata?.sourceFormat).toBe('verifiable-intent');
  });

  it('round-trips preserves core identity fields', () => {
    const receipt = makeSignedReceipt();
    const vi = aarToVerifiableIntent(receipt);
    const partial = verifiableIntentToAAR(vi);

    expect(partial.receiptId).toBe(receipt.receiptId);
    expect(partial.agent?.id).toBe(receipt.agent.id);
    expect(partial.principal?.id).toBe(receipt.principal.id);
    expect(partial.cost?.amount).toBe(receipt.cost.amount);
  });
});

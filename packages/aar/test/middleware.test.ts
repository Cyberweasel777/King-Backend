import { describe, it, expect } from 'vitest';
import { aarMiddleware } from '../src/middleware/express';
import { generateKeyPair } from '../src/sign';
import { verifyReceipt } from '../src/verify';
import { decodeBase64 } from '../src/encoding';
import type { AARReceipt } from '../src/types';

// Minimal Express-like mocks
function createReq(overrides: Record<string, unknown> = {}): any {
  return {
    method: 'GET',
    path: '/test',
    originalUrl: '/test',
    url: '/test',
    headers: {},
    query: {},
    body: {},
    header: function (name: string) {
      const headers = this.headers as Record<string, string>;
      return headers[name.toLowerCase()];
    },
    ...overrides,
  };
}

function createRes(): any {
  const headers: Record<string, string> = {};
  const chunks: Buffer[] = [];
  let ended = false;
  let _statusCode = 200;

  return {
    get statusCode() { return _statusCode; },
    set statusCode(v: number) { _statusCode = v; },
    headersSent: false,
    _getHeaders: () => headers,
    setHeader: (name: string, value: string) => { headers[name] = value; },
    getHeader: (name: string) => headers[name],
    write: function (chunk: any, encoding?: any, cb?: any) {
      if (typeof chunk === 'string') chunks.push(Buffer.from(chunk));
      else if (Buffer.isBuffer(chunk)) chunks.push(chunk);
      if (typeof encoding === 'function') encoding();
      else if (typeof cb === 'function') cb();
      return true;
    },
    end: function (chunk?: any, encoding?: any, cb?: any) {
      if (typeof chunk === 'string') chunks.push(Buffer.from(chunk));
      else if (Buffer.isBuffer(chunk)) chunks.push(chunk);
      else if (typeof chunk === 'function') { chunk(); return this; }
      if (typeof encoding === 'function') encoding();
      else if (typeof cb === 'function') cb();
      ended = true;
      return this;
    },
  };
}

function decodeReceipt(headerValue: string): AARReceipt {
  const bytes = decodeBase64(headerValue);
  return JSON.parse(new TextDecoder().decode(bytes)) as AARReceipt;
}

describe('aarMiddleware', () => {
  it('attaches X-AAR-Receipt header on response', () => {
    const { secretKey } = generateKeyPair();
    const mw = aarMiddleware({ agentId: 'test/v1', secretKey });
    const req = createReq();
    const res = createRes();

    mw(req, res, () => {});
    res.end('{"ok":true}');

    const header = res._getHeaders()['X-AAR-Receipt'];
    expect(header).toBeTruthy();
    const receipt = decodeReceipt(header);
    expect(receipt.agent.id).toBe('test/v1');
    expect(receipt.signature.sig).toBeTruthy();
  });

  it('receipt is cryptographically valid', () => {
    const { secretKey } = generateKeyPair();
    const mw = aarMiddleware({ agentId: 'test/v1', secretKey });
    const req = createReq();
    const res = createRes();

    mw(req, res, () => {});
    res.end('data');

    const receipt = decodeReceipt(res._getHeaders()['X-AAR-Receipt']);
    const result = verifyReceipt(receipt);
    expect(result.ok).toBe(true);
  });

  it('uses custom header name', () => {
    const { secretKey } = generateKeyPair();
    const mw = aarMiddleware({ agentId: 'test/v1', secretKey, headerName: 'X-Custom' });
    const req = createReq();
    const res = createRes();

    mw(req, res, () => {});
    res.end('ok');

    expect(res._getHeaders()['X-Custom']).toBeTruthy();
    expect(res._getHeaders()['X-AAR-Receipt']).toBeUndefined();
  });

  it('resolves principal from x-wallet header', () => {
    const { secretKey } = generateKeyPair();
    const mw = aarMiddleware({ agentId: 'test/v1', secretKey });
    const req = createReq({
      headers: { 'x-wallet': '0xABC123' },
      header: function (name: string) { return (this as any).headers[name.toLowerCase()]; },
    });
    const res = createRes();

    mw(req, res, () => {});
    res.end('ok');

    const receipt = decodeReceipt(res._getHeaders()['X-AAR-Receipt']);
    expect(receipt.principal.id).toBe('0xABC123');
    expect(receipt.principal.type).toBe('user');
  });

  it('defaults to anonymous principal', () => {
    const { secretKey } = generateKeyPair();
    const mw = aarMiddleware({ agentId: 'test/v1', secretKey });
    const req = createReq();
    const res = createRes();

    mw(req, res, () => {});
    res.end('ok');

    const receipt = decodeReceipt(res._getHeaders()['X-AAR-Receipt']);
    expect(receipt.principal.id).toBe('anonymous');
  });

  it('calls persist callback', () => {
    const { secretKey } = generateKeyPair();
    let persisted: AARReceipt | null = null;
    const mw = aarMiddleware({
      agentId: 'test/v1',
      secretKey,
      persist: (r) => { persisted = r; },
    });
    const req = createReq();
    const res = createRes();

    mw(req, res, () => {});
    res.end('ok');

    expect(persisted).not.toBeNull();
    expect(persisted!.receiptId).toBeTruthy();
  });
});

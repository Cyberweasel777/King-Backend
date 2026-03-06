import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { canonicalize } from '../canonicalize';
import { encodeBase64, utf8Encode } from '../encoding';
import { hashInput, hashOutput } from '../hash';
import { createReceipt, encodeReceiptHeader } from '../receipt';
import { loadSecretKey, publicKeyFromSecret, signReceipt } from '../sign';
import type { AARReceipt, Cost, Principal, UnsignedReceipt } from '../types';

export interface AARMiddlewareOptions {
  agentId: string;
  agentName?: string;
  agentVersion?: string;
  secretKey: Uint8Array | string;
  headerName?: string;
  principalResolver?: (req: Request) => Principal;
  scopeResolver?: (req: Request) => string[];
  costResolver?: (req: Request, res: Response) => Cost | null;
  persist?: (receipt: AARReceipt) => void | Promise<void>;
}

function defaultPrincipalResolver(req: Request): Principal {
  const wallet = req.headers['x-wallet'];
  if (typeof wallet === 'string' && wallet.trim()) {
    return { id: wallet.trim(), type: 'user' };
  }

  const apiKey = req.headers['x-api-key'];
  if (typeof apiKey === 'string' && apiKey.trim()) {
    return { id: `apikey:${apiKey.trim().slice(0, 8)}...`, type: 'service' };
  }

  return { id: 'anonymous', type: 'other' };
}

function defaultScopeResolver(req: Request): string[] {
  const method = req.method.toLowerCase();
  const path = req.path || '/';
  return [`${method}:${path}`];
}

export function aarMiddleware(options: AARMiddlewareOptions): RequestHandler {
  const sk = loadSecretKey(options.secretKey);
  const pk = publicKeyFromSecret(sk);
  const headerName = options.headerName ?? 'X-AAR-Receipt';
  const resolvePrincipal = options.principalResolver ?? defaultPrincipalResolver;
  const resolveScope = options.scopeResolver ?? defaultScopeResolver;
  const resolveCost = options.costResolver ?? (() => null);

  return (req: Request, res: Response, next: NextFunction): void => {
    const chunks: Buffer[] = [];
    let finalized = false;

    const originalWrite = res.write.bind(res);
    const originalEnd = res.end.bind(res);

    const finalizeReceipt = (): void => {
      if (finalized) return;
      finalized = true;

      try {
        const outputBody = chunks.length > 0 ? Buffer.concat(chunks) : Buffer.alloc(0);
        const inputData = { query: req.query, body: req.body, method: req.method, path: req.path };

        const cost = resolveCost(req, res) ?? { amount: '0', currency: 'USD' };
        const actionPath = req.originalUrl?.split('?')[0] || req.path || '/';

        const unsigned = createReceipt({
          agent: {
            id: options.agentId,
            name: options.agentName,
            version: options.agentVersion,
          },
          principal: resolvePrincipal(req),
          action: {
            type: 'api.call',
            target: actionPath,
            method: req.method.toUpperCase(),
            status: res.statusCode < 400 ? 'success' : 'failure',
          },
          scope: { permissions: resolveScope(req) },
          inputHash: hashInput(inputData),
          outputHash: hashOutput(outputBody),
          cost,
        });

        const receipt = signReceipt(unsigned, sk);

        if (!res.headersSent) {
          res.setHeader(headerName, encodeReceiptHeader(receipt));
        }

        if (options.persist) {
          void Promise.resolve(options.persist(receipt)).catch(() => {});
        }
      } catch {
        // Receipt generation failure should never break the response
      }
    };

    res.write = ((chunk: unknown, encoding?: unknown, cb?: unknown): boolean => {
      if (Buffer.isBuffer(chunk)) {
        chunks.push(chunk);
      } else if (typeof chunk === 'string') {
        chunks.push(Buffer.from(chunk, (typeof encoding === 'string' ? encoding : 'utf-8') as BufferEncoding));
      } else if (chunk instanceof Uint8Array) {
        chunks.push(Buffer.from(chunk));
      }

      return (originalWrite as Function).call(res, chunk, encoding, cb);
    }) as typeof res.write;

    res.end = ((chunk?: unknown, encoding?: unknown, cb?: unknown): Response => {
      if (chunk != null) {
        if (Buffer.isBuffer(chunk)) {
          chunks.push(chunk);
        } else if (typeof chunk === 'string') {
          chunks.push(Buffer.from(chunk, (typeof encoding === 'string' ? encoding : 'utf-8') as BufferEncoding));
        } else if (chunk instanceof Uint8Array) {
          chunks.push(Buffer.from(chunk));
        }
      }
      finalizeReceipt();
      return (originalEnd as Function).call(res, chunk, encoding, cb);
    }) as typeof res.end;

    next();
  };
}

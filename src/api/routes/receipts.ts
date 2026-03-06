import type { Request, RequestHandler, Response } from 'express';
import { Router } from 'express';
import { verifyReceipt } from '@botindex/aar';
import type { AgentActionReceipt } from '../middleware/receiptMiddleware';
import {
  findReceiptById,
  getReceiptPublicKeyBase64,
  queryReceipts,
  toAARReceipt,
  TRUST_LAYER_JSON,
} from '../middleware/receiptMiddleware';

const router = Router();

function parseIsoTimestamp(raw: unknown): number | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return null;
  return ms;
}

function isReceiptsBase(req: Request): boolean {
  return req.baseUrl.endsWith('/receipts');
}

function isWellKnownBase(req: Request): boolean {
  return req.baseUrl.endsWith('/.well-known');
}

function parseLimit(raw: unknown): number | null {
  if (raw === undefined) return 100;
  const parsed = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 100) return null;
  return parsed;
}

function parsePrincipal(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const principal = raw.trim();
  if (!principal) return null;
  return principal;
}

function respondValidationError(res: Response, message: string): void {
  res.status(400).json({ error: 'invalid_query', message });
}

function parseVerificationPublicKey(raw: unknown): Uint8Array | string | undefined {
  if (typeof raw !== 'string') return undefined;
  const value = raw.trim();
  if (!value) return undefined;
  if (/^[A-Za-z0-9+/=]+$/.test(value) && /[+/=]/.test(value)) {
    return Buffer.from(value, 'base64');
  }
  return value;
}

function isLegacyReceiptPayload(value: unknown): value is AgentActionReceipt {
  if (!value || typeof value !== 'object') return false;
  const receipt = value as Record<string, unknown>;
  return (
    typeof receipt.receiptId === 'string' &&
    typeof receipt.agent === 'string' &&
    typeof receipt.principal === 'string' &&
    typeof receipt.action === 'string' &&
    typeof receipt.scope === 'string' &&
    typeof receipt.inputHash === 'string' &&
    typeof receipt.outputHash === 'string' &&
    typeof receipt.timestamp === 'string' &&
    typeof receipt.signature === 'string'
  );
}

export const trustLayerHandler: RequestHandler = (_req, res) => {
  res.json(TRUST_LAYER_JSON);
};

router.get('/export', async (req: Request, res: Response) => {
  if (!isReceiptsBase(req)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const principal = parsePrincipal(req.query.principal);
  if (!principal) {
    respondValidationError(res, 'principal query parameter is required');
    return;
  }

  const fromRaw = req.query.from;
  const toRaw = req.query.to;
  const format = typeof req.query.format === 'string' ? req.query.format.toLowerCase() : 'jsonl';
  if (format !== 'jsonl') {
    respondValidationError(res, 'format must be jsonl');
    return;
  }

  if (typeof fromRaw === 'string' && parseIsoTimestamp(fromRaw) === null) {
    respondValidationError(res, 'from must be a valid ISO timestamp');
    return;
  }
  if (typeof toRaw === 'string' && parseIsoTimestamp(toRaw) === null) {
    respondValidationError(res, 'to must be a valid ISO timestamp');
    return;
  }

  const limit = parseLimit(req.query.limit);
  if (limit === null) {
    respondValidationError(res, 'limit must be an integer between 1 and 100');
    return;
  }

  const receipts = await queryReceipts({
    principal,
    from: typeof fromRaw === 'string' ? fromRaw : undefined,
    to: typeof toRaw === 'string' ? toRaw : undefined,
    limit,
  });

  const lines = receipts.map((receipt) => JSON.stringify(receipt)).join('\n');
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.send(lines.length > 0 ? `${lines}\n` : '');
});

router.get('/trust-layer', (req: Request, res: Response) => {
  if (!isWellKnownBase(req)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  res.json(TRUST_LAYER_JSON);
});

router.get('/receipt-pubkey', (req: Request, res: Response) => {
  if (!isWellKnownBase(req)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  res.json({
    signing: 'Ed25519',
    encoding: 'base64',
    publicKey: getReceiptPublicKeyBase64(),
  });
});

router.get('/', async (req: Request, res: Response) => {
  if (!isReceiptsBase(req)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const principal = parsePrincipal(req.query.principal);
  if (!principal) {
    respondValidationError(res, 'principal query parameter is required');
    return;
  }

  const fromRaw = req.query.from;
  const toRaw = req.query.to;

  if (typeof fromRaw === 'string' && parseIsoTimestamp(fromRaw) === null) {
    respondValidationError(res, 'from must be a valid ISO timestamp');
    return;
  }
  if (typeof toRaw === 'string' && parseIsoTimestamp(toRaw) === null) {
    respondValidationError(res, 'to must be a valid ISO timestamp');
    return;
  }

  const limit = parseLimit(req.query.limit);
  if (limit === null) {
    respondValidationError(res, 'limit must be an integer between 1 and 100');
    return;
  }

  const receipts = await queryReceipts({
    principal,
    from: typeof fromRaw === 'string' ? fromRaw : undefined,
    to: typeof toRaw === 'string' ? toRaw : undefined,
    limit,
  });

  res.json({
    principal,
    count: receipts.length,
    receipts,
  });
});

router.get('/:receiptId', async (req: Request, res: Response) => {
  if (!isReceiptsBase(req)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const receiptId = req.params.receiptId;
  if (!receiptId) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  const receipt = await findReceiptById(receiptId);
  if (!receipt) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  res.json(receipt);
});

router.post('/verify', (req: Request, res: Response) => {
  if (!isReceiptsBase(req)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  if (!req.body || typeof req.body !== 'object') {
    respondValidationError(res, 'request body must be a JSON object');
    return;
  }

  const payload = req.body as Record<string, unknown>;
  const receiptInput = payload.receipt ?? payload;
  const receipt = isLegacyReceiptPayload(receiptInput)
    ? toAARReceipt(receiptInput)
    : receiptInput;

  const publicKey =
    parseVerificationPublicKey(payload.publicKey) ??
    Buffer.from(getReceiptPublicKeyBase64(), 'base64');

  const result = verifyReceipt(receipt as any, publicKey);
  res.json({
    ok: result.ok,
    reason: result.reason ?? null,
  });
});

export default router;

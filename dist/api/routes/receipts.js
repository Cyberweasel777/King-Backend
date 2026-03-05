"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.trustLayerHandler = void 0;
const express_1 = require("express");
const receiptMiddleware_1 = require("../middleware/receiptMiddleware");
const router = (0, express_1.Router)();
function parseIsoTimestamp(raw) {
    if (typeof raw !== 'string' || !raw.trim())
        return null;
    const ms = Date.parse(raw);
    if (!Number.isFinite(ms))
        return null;
    return ms;
}
function isReceiptsBase(req) {
    return req.baseUrl.endsWith('/receipts');
}
function isWellKnownBase(req) {
    return req.baseUrl.endsWith('/.well-known');
}
function parseLimit(raw) {
    if (raw === undefined)
        return 100;
    const parsed = Number.parseInt(String(raw), 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 100)
        return null;
    return parsed;
}
function parsePrincipal(raw) {
    if (typeof raw !== 'string')
        return null;
    const principal = raw.trim();
    if (!principal)
        return null;
    return principal;
}
function respondValidationError(res, message) {
    res.status(400).json({ error: 'invalid_query', message });
}
const trustLayerHandler = (_req, res) => {
    res.json(receiptMiddleware_1.TRUST_LAYER_JSON);
};
exports.trustLayerHandler = trustLayerHandler;
router.get('/export', async (req, res) => {
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
    const receipts = await (0, receiptMiddleware_1.queryReceipts)({
        principal,
        from: typeof fromRaw === 'string' ? fromRaw : undefined,
        to: typeof toRaw === 'string' ? toRaw : undefined,
        limit,
    });
    const lines = receipts.map((receipt) => JSON.stringify(receipt)).join('\n');
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.send(lines.length > 0 ? `${lines}\n` : '');
});
router.get('/trust-layer', (req, res) => {
    if (!isWellKnownBase(req)) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    res.json(receiptMiddleware_1.TRUST_LAYER_JSON);
});
router.get('/receipt-pubkey', (req, res) => {
    if (!isWellKnownBase(req)) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    res.json({
        signing: 'Ed25519',
        encoding: 'base64',
        publicKey: (0, receiptMiddleware_1.getReceiptPublicKeyBase64)(),
    });
});
router.get('/', async (req, res) => {
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
    const receipts = await (0, receiptMiddleware_1.queryReceipts)({
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
router.get('/:receiptId', async (req, res) => {
    if (!isReceiptsBase(req)) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const receiptId = req.params.receiptId;
    if (!receiptId) {
        res.status(404).json({ error: 'not_found' });
        return;
    }
    const receipt = await (0, receiptMiddleware_1.findReceiptById)(receiptId);
    if (!receipt) {
        res.status(404).json({ error: 'not_found' });
        return;
    }
    res.json(receipt);
});
exports.default = router;
//# sourceMappingURL=receipts.js.map
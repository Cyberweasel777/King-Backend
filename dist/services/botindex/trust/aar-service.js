"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signReceipt = signReceipt;
exports.verifyReceipt = verifyReceipt;
const crypto_1 = __importDefault(require("crypto"));
const tweetnacl_1 = __importDefault(require("tweetnacl"));
const receiptMiddleware_1 = require("../../../api/middleware/receiptMiddleware");
function toCanonicalValue(input) {
    if (input === undefined)
        return undefined;
    if (input === null)
        return null;
    if (typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean') {
        return input;
    }
    if (typeof input === 'bigint') {
        return input.toString();
    }
    if (Buffer.isBuffer(input)) {
        return input.toString('base64');
    }
    if (input instanceof Uint8Array) {
        return Buffer.from(input).toString('base64');
    }
    if (input instanceof Date) {
        return input.toISOString();
    }
    if (Array.isArray(input)) {
        const arr = [];
        for (const item of input) {
            const normalized = toCanonicalValue(item);
            if (normalized !== undefined) {
                arr.push(normalized);
            }
        }
        return arr;
    }
    if (typeof input === 'object') {
        const out = {};
        const obj = input;
        for (const key of Object.keys(obj).sort()) {
            const normalized = toCanonicalValue(obj[key]);
            if (normalized !== undefined) {
                out[key] = normalized;
            }
        }
        return out;
    }
    return String(input);
}
function canonicalStringify(value) {
    const normalized = toCanonicalValue(value);
    return JSON.stringify(normalized ?? null);
}
function sha256Hex(value) {
    return crypto_1.default.createHash('sha256').update(value).digest('hex');
}
function signDetachedPayload(payload) {
    const { secretKey } = (0, receiptMiddleware_1.getSigningKeyState)();
    const signature = tweetnacl_1.default.sign.detached(Buffer.from(payload, 'utf-8'), secretKey);
    return Buffer.from(signature).toString('base64');
}
function resolvePublicKey(publicKey) {
    const keyBase64 = publicKey?.trim() || (0, receiptMiddleware_1.getReceiptPublicKeyBase64)();
    try {
        const decoded = Buffer.from(keyBase64, 'base64');
        if (decoded.length !== tweetnacl_1.default.sign.publicKeyLength) {
            return null;
        }
        return new Uint8Array(decoded);
    }
    catch {
        return null;
    }
}
function parseSignature(signatureBase64) {
    try {
        const decoded = Buffer.from(signatureBase64, 'base64');
        if (decoded.length !== tweetnacl_1.default.sign.signatureLength) {
            return null;
        }
        return new Uint8Array(decoded);
    }
    catch {
        return null;
    }
}
function toUnsignedReceipt(receipt) {
    return {
        receiptId: receipt.receiptId,
        agent: receipt.agent,
        principal: receipt.principal,
        action: receipt.action,
        scope: receipt.scope,
        inputHash: receipt.inputHash,
        outputHash: receipt.outputHash,
        timestamp: receipt.timestamp,
        cost: receipt.cost,
    };
}
function hasReceiptShape(receipt) {
    const isCostValid = receipt.cost === null || typeof receipt.cost === 'string' || typeof receipt.cost === 'number';
    return (typeof receipt.receiptId === 'string' &&
        typeof receipt.agent === 'string' &&
        typeof receipt.principal === 'string' &&
        typeof receipt.action === 'string' &&
        typeof receipt.scope === 'string' &&
        typeof receipt.inputHash === 'string' &&
        typeof receipt.outputHash === 'string' &&
        typeof receipt.timestamp === 'string' &&
        typeof receipt.signature === 'string' &&
        isCostValid);
}
function signReceipt(params) {
    const unsignedReceipt = {
        receiptId: crypto_1.default.randomUUID(),
        agent: params.agent,
        principal: params.principal,
        action: params.action,
        scope: params.scope,
        inputHash: sha256Hex(canonicalStringify(params.inputData)),
        outputHash: sha256Hex(canonicalStringify(params.outputData)),
        timestamp: new Date().toISOString(),
        cost: params.cost ?? null,
    };
    return {
        ...unsignedReceipt,
        signature: signDetachedPayload(canonicalStringify(unsignedReceipt)),
    };
}
function verifyReceipt(receipt, publicKey) {
    const details = {
        agent: receipt?.agent,
        action: receipt?.action,
        timestamp: receipt?.timestamp,
        inputHash: receipt?.inputHash,
        outputHash: receipt?.outputHash,
    };
    if (!hasReceiptShape(receipt)) {
        return {
            valid: false,
            details: { ...details, message: 'Receipt payload is missing required fields' },
        };
    }
    const verifierPublicKey = resolvePublicKey(publicKey);
    if (!verifierPublicKey) {
        return {
            valid: false,
            details: { ...details, message: 'Invalid Ed25519 public key' },
        };
    }
    const signature = parseSignature(receipt.signature);
    if (!signature) {
        return {
            valid: false,
            details: { ...details, message: 'Invalid signature encoding' },
        };
    }
    const payload = Buffer.from(canonicalStringify(toUnsignedReceipt(receipt)), 'utf-8');
    const valid = tweetnacl_1.default.sign.detached.verify(new Uint8Array(payload), signature, verifierPublicKey);
    return {
        valid,
        details,
    };
}
//# sourceMappingURL=aar-service.js.map
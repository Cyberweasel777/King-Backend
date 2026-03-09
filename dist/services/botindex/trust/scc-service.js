"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.anchorSCC = anchorSCC;
exports.verifyAnchor = verifyAnchor;
exports.verifySCCChain = verifySCCChain;
const crypto_1 = __importDefault(require("crypto"));
const tweetnacl_1 = __importDefault(require("tweetnacl"));
const receiptMiddleware_1 = require("../../../api/middleware/receiptMiddleware");
const MAX_SCC_ANCHORS = 100_000;
const anchorStore = new Map();
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
function merkleRoot(leaves) {
    if (leaves.length === 0)
        return sha256Hex('');
    let level = leaves.map((leaf) => sha256Hex(leaf));
    while (level.length > 1) {
        const next = [];
        for (let idx = 0; idx < level.length; idx += 2) {
            const left = level[idx];
            const right = level[idx + 1] ?? left;
            next.push(sha256Hex(`${left}${right}`));
        }
        level = next;
    }
    return level[0];
}
function signCertificate(unsignedCert) {
    const { secretKey } = (0, receiptMiddleware_1.getSigningKeyState)();
    const payload = Buffer.from(canonicalStringify(unsignedCert), 'utf-8');
    const signature = tweetnacl_1.default.sign.detached(new Uint8Array(payload), secretKey);
    return Buffer.from(signature).toString('base64');
}
function computeAnchorHash(certificateId, timestamp, root) {
    return sha256Hex(`${certificateId}${timestamp}${root}`);
}
function touchAnchor(anchorHash, value) {
    if (anchorStore.has(anchorHash)) {
        anchorStore.delete(anchorHash);
    }
    anchorStore.set(anchorHash, value);
}
function setAnchor(anchorHash, value) {
    touchAnchor(anchorHash, value);
    while (anchorStore.size > MAX_SCC_ANCHORS) {
        const oldest = anchorStore.keys().next().value;
        if (!oldest)
            break;
        anchorStore.delete(oldest);
    }
}
function toUnsignedCertificate(certificate) {
    return {
        certificateId: certificate.certificateId,
        agentId: certificate.agentId,
        sessionIndex: certificate.sessionIndex,
        parentHash: certificate.parentHash,
        memoryRoot: certificate.memoryRoot,
        capabilityHash: certificate.capabilityHash,
        stateHash: certificate.stateHash,
        merkleRoot: certificate.merkleRoot,
        timestamp: certificate.timestamp,
    };
}
function verifyCertificateSignature(certificate, publicKey) {
    try {
        const keyBase64 = publicKey?.trim() || (0, receiptMiddleware_1.getReceiptPublicKeyBase64)();
        const key = Buffer.from(keyBase64, 'base64');
        if (key.length !== tweetnacl_1.default.sign.publicKeyLength) {
            return false;
        }
        const signature = Buffer.from(certificate.signature, 'base64');
        if (signature.length !== tweetnacl_1.default.sign.signatureLength) {
            return false;
        }
        const payload = Buffer.from(canonicalStringify(toUnsignedCertificate(certificate)), 'utf-8');
        return tweetnacl_1.default.sign.detached.verify(new Uint8Array(payload), new Uint8Array(signature), new Uint8Array(key));
    }
    catch {
        return false;
    }
}
function anchorSCC(params) {
    const certificateId = crypto_1.default.randomUUID();
    const timestamp = new Date().toISOString();
    const parentHash = params.parentHash?.trim() || null;
    const root = merkleRoot([params.memoryRoot, params.capabilityHash, params.stateHash]);
    const unsignedCertificate = {
        certificateId,
        agentId: params.agentId,
        sessionIndex: String(params.sessionIndex),
        parentHash,
        memoryRoot: params.memoryRoot,
        capabilityHash: params.capabilityHash,
        stateHash: params.stateHash,
        merkleRoot: root,
        timestamp,
    };
    const certificate = {
        ...unsignedCertificate,
        signature: signCertificate(unsignedCertificate),
    };
    const anchorHash = computeAnchorHash(certificate.certificateId, certificate.timestamp, certificate.merkleRoot);
    setAnchor(anchorHash, {
        anchorHash,
        certificate,
        anchoredAt: timestamp,
    });
    return {
        certificate,
        anchorHash,
    };
}
function verifyAnchor(anchorHash) {
    const normalized = anchorHash.trim();
    if (!normalized) {
        return { found: false };
    }
    const found = anchorStore.get(normalized);
    if (!found) {
        return { found: false };
    }
    touchAnchor(normalized, found);
    return {
        found: true,
        certificate: found.certificate,
        anchoredAt: found.anchoredAt,
    };
}
function verifySCCChain(certificates) {
    const gaps = [];
    for (let idx = 0; idx < certificates.length; idx += 1) {
        const certificate = certificates[idx];
        const expectedMerkleRoot = merkleRoot([
            certificate.memoryRoot,
            certificate.capabilityHash,
            certificate.stateHash,
        ]);
        if (certificate.merkleRoot !== expectedMerkleRoot) {
            gaps.push({
                index: idx,
                certificateId: certificate.certificateId,
                reason: 'invalid_merkle_root',
                expected: expectedMerkleRoot,
                actual: certificate.merkleRoot,
            });
        }
        if (!verifyCertificateSignature(certificate)) {
            gaps.push({
                index: idx,
                certificateId: certificate.certificateId,
                reason: 'invalid_signature',
            });
        }
        if (idx > 0) {
            const previous = certificates[idx - 1];
            const expectedParent = computeAnchorHash(previous.certificateId, previous.timestamp, previous.merkleRoot);
            if (certificate.parentHash !== expectedParent) {
                gaps.push({
                    index: idx,
                    certificateId: certificate.certificateId,
                    reason: 'parent_hash_mismatch',
                    expected: expectedParent,
                    actual: certificate.parentHash,
                });
            }
        }
    }
    return {
        valid: certificates.length > 0 && gaps.length === 0,
        chainLength: certificates.length,
        gaps,
        firstSession: certificates[0] ? String(certificates[0].sessionIndex) : '',
        lastSession: certificates[certificates.length - 1]
            ? String(certificates[certificates.length - 1].sessionIndex)
            : '',
    };
}
//# sourceMappingURL=scc-service.js.map
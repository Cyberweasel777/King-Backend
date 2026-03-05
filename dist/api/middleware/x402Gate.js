"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isX402Enabled = isX402Enabled;
exports.getX402RuntimeConfig = getX402RuntimeConfig;
exports.createX402Gate = createX402Gate;
const express_1 = require("@x402/express");
const server_1 = require("@x402/evm/exact/server");
const server_2 = require("@x402/core/server");
const jose_1 = require("jose");
const zod_1 = require("zod");
const crypto_1 = __importDefault(require("crypto"));
const logger_1 = __importDefault(require("../../config/logger"));
const SUPPORTED_NETWORKS = ['base-sepolia', 'base', 'eip155:84532', 'eip155:8453'];
const NETWORK_SCHEMA = zod_1.z.enum(SUPPORTED_NETWORKS);
const WALLET_SCHEMA = zod_1.z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const LEGACY_TO_CAIP = {
    'base-sepolia': 'eip155:84532',
    base: 'eip155:8453',
};
/**
 * Generate a CDP-compatible JWT for authenticating with the Coinbase facilitator.
 * Uses Ed25519 (EdDSA) signing with the CDP API Key ID + Secret.
 */
async function generateCdpJwt(apiKeyId, apiKeySecret, requestMethod, requestHost, requestPath) {
    const decoded = Buffer.from(apiKeySecret, 'base64');
    if (decoded.length !== 64) {
        throw new Error(`Invalid Ed25519 key length: expected 64, got ${decoded.length}`);
    }
    const seed = decoded.subarray(0, 32);
    const publicKey = decoded.subarray(32);
    const jwk = {
        kty: 'OKP',
        crv: 'Ed25519',
        d: seed.toString('base64url'),
        x: publicKey.toString('base64url'),
    };
    const key = await (0, jose_1.importJWK)(jwk, 'EdDSA');
    const now = Math.floor(Date.now() / 1000);
    const nonce = crypto_1.default.randomBytes(16).toString('hex');
    return new jose_1.SignJWT({
        sub: apiKeyId,
        iss: 'cdp',
        uris: [`${requestMethod} ${requestHost}${requestPath}`],
    })
        .setProtectedHeader({ alg: 'EdDSA', kid: apiKeyId, typ: 'JWT', nonce })
        .setIssuedAt(now)
        .setNotBefore(now)
        .setExpirationTime(now + 120)
        .sign(key);
}
function getFacilitatorClient() {
    const url = process.env.X402_FACILITATOR_URL;
    const cdpApiKeyId = process.env.CDP_API_KEY;
    const cdpApiKeySecret = process.env.CDP_API_KEY_SECRET;
    const config = {};
    if (url)
        config.url = url;
    if (cdpApiKeyId && cdpApiKeySecret) {
        // CDP JWT uses host (not origin) in the URI claim — matches @coinbase/cdp-sdk pattern
        const facilitatorHost = url
            ? new URL(url).host
            : 'api.cdp.coinbase.com';
        config.createAuthHeaders = async () => {
            // Map facilitator operations to their HTTP paths
            // Keys must match the path names used by @x402/core HTTPFacilitatorClient internally:
            // "verify", "settle", "supported" (not "getSupported")
            const pathMap = {
                verify: { method: 'POST', path: '/platform/v2/x402/verify' },
                settle: { method: 'POST', path: '/platform/v2/x402/settle' },
                supported: { method: 'GET', path: '/platform/v2/x402/supported' },
            };
            const headers = {};
            for (const [op, { method, path }] of Object.entries(pathMap)) {
                const jwt = await generateCdpJwt(cdpApiKeyId, cdpApiKeySecret, method, facilitatorHost, path);
                headers[op] = { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' };
            }
            return headers;
        };
        logger_1.default.info('x402: CDP JWT auth configured for facilitator');
    }
    return new server_2.HTTPFacilitatorClient(config);
}
let facilitatorClient = null;
const resourceServerByNetwork = new Map();
function parseEnabledFlag(rawValue) {
    if (!rawValue)
        return false;
    return ['1', 'true', 'yes', 'on'].includes(rawValue.toLowerCase());
}
function resolveNetwork(override) {
    const networkValue = override ?? process.env.X402_NETWORK ?? 'base-sepolia';
    const parsed = NETWORK_SCHEMA.safeParse(networkValue);
    if (parsed.success)
        return parsed.data;
    logger_1.default.warn({ x402Network: networkValue, fallback: 'base-sepolia' }, 'Invalid X402_NETWORK, using base-sepolia');
    return 'base-sepolia';
}
function toCaipNetwork(network) {
    if (network in LEGACY_TO_CAIP) {
        return LEGACY_TO_CAIP[network];
    }
    return network;
}
let resourceServerInitPromise = null;
function getResourceServer(network) {
    const cached = resourceServerByNetwork.get(network);
    if (cached)
        return cached;
    if (!facilitatorClient) {
        facilitatorClient = getFacilitatorClient();
    }
    const server = new express_1.x402ResourceServer(facilitatorClient).register(network, new server_1.ExactEvmScheme());
    resourceServerByNetwork.set(network, server);
    // Kick off async initialize to fetch supported schemes from facilitator
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resourceServerInitPromise = server.initialize()
        .then(() => logger_1.default.info({ network }, 'x402 resource server initialized'))
        .catch((err) => logger_1.default.warn({ err, network }, 'x402 resource server init failed (will retry on request)'));
    return server;
}
function resolveWalletAddress() {
    const wallet = process.env.X402_WALLET_ADDRESS;
    const parsed = WALLET_SCHEMA.safeParse(wallet);
    if (!parsed.success)
        return null;
    return parsed.data;
}
function buildUnavailableHandler() {
    return (_req, res) => {
        res.status(503).json({
            error: 'x402_not_configured',
            message: 'x402 is enabled but X402_WALLET_ADDRESS is not configured.'
        });
    };
}
function isX402Enabled() {
    return parseEnabledFlag(process.env.X402_ENABLED);
}
function getX402RuntimeConfig() {
    return {
        enabled: isX402Enabled(),
        network: resolveNetwork(),
    };
}
function createX402Gate(options = {}) {
    if (!isX402Enabled()) {
        return (_req, _res, next) => next();
    }
    const payTo = resolveWalletAddress();
    if (!payTo) {
        logger_1.default.error('x402 enabled but X402_WALLET_ADDRESS is not a valid EVM address');
        return buildUnavailableHandler();
    }
    const network = resolveNetwork(options.network);
    const caipNetwork = toCaipNetwork(network);
    const gate = (0, express_1.paymentMiddleware)({
        '*': {
            accepts: {
                scheme: 'exact',
                price: options.price || '$0.01',
                network: caipNetwork,
                payTo,
            },
            description: options.description || 'x402 protected endpoint',
        },
    }, getResourceServer(caipNetwork), undefined, undefined, false);
    return async (req, res, next) => {
        // Skip x402 if already authenticated via API key or free trial
        if (req.__apiKeyAuthenticated || req.__freeTrialAuthenticated) {
            next();
            return;
        }
        try {
            // Ensure resource server has fetched supported schemes before processing
            if (resourceServerInitPromise) {
                await resourceServerInitPromise;
            }
            await gate(req, res, next);
        }
        catch (error) {
            logger_1.default.error({ err: error }, 'x402 gate failed');
            res.status(500).json({
                error: 'x402_gate_error',
                message: 'Failed to process x402 payment gate.',
            });
        }
    };
}
//# sourceMappingURL=x402Gate.js.map
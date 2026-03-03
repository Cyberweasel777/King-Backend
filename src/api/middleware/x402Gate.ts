import type { RequestHandler } from 'express';
import { paymentMiddleware, x402ResourceServer } from '@x402/express';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { HTTPFacilitatorClient } from '@x402/core/server';
import { SignJWT, importJWK } from 'jose';
import { z } from 'zod';
import crypto from 'crypto';
import logger from '../../config/logger';

const SUPPORTED_NETWORKS = ['base-sepolia', 'base', 'eip155:84532', 'eip155:8453'] as const;
const NETWORK_SCHEMA = z.enum(SUPPORTED_NETWORKS);
const WALLET_SCHEMA = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const LEGACY_TO_CAIP = {
  'base-sepolia': 'eip155:84532',
  base: 'eip155:8453',
} as const;

type SupportedNetwork = z.infer<typeof NETWORK_SCHEMA>;
type LegacyNetwork = keyof typeof LEGACY_TO_CAIP;
type CaipNetwork = (typeof LEGACY_TO_CAIP)[LegacyNetwork];

/**
 * Generate a CDP-compatible JWT for authenticating with the Coinbase facilitator.
 * Uses Ed25519 (EdDSA) signing with the CDP API Key ID + Secret.
 */
async function generateCdpJwt(
  apiKeyId: string,
  apiKeySecret: string,
  requestMethod: string,
  requestHost: string,
  requestPath: string
): Promise<string> {
  const decoded = Buffer.from(apiKeySecret, 'base64');
  if (decoded.length !== 64) {
    throw new Error(`Invalid Ed25519 key length: expected 64, got ${decoded.length}`);
  }

  const seed = decoded.subarray(0, 32);
  const publicKey = decoded.subarray(32);

  const jwk = {
    kty: 'OKP' as const,
    crv: 'Ed25519' as const,
    d: seed.toString('base64url'),
    x: publicKey.toString('base64url'),
  };

  const key = await importJWK(jwk, 'EdDSA');
  const now = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(16).toString('hex');

  return new SignJWT({
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

function getFacilitatorClient(): HTTPFacilitatorClient {
  const url = process.env.X402_FACILITATOR_URL;
  const cdpApiKeyId = process.env.CDP_API_KEY;
  const cdpApiKeySecret = process.env.CDP_API_KEY_SECRET;

  const config: Record<string, unknown> = {};
  if (url) config.url = url;

  if (cdpApiKeyId && cdpApiKeySecret) {
    // CDP JWT uses host (not origin) in the URI claim — matches @coinbase/cdp-sdk pattern
    const facilitatorHost = url
      ? new URL(url).host
      : 'api.cdp.coinbase.com';

    config.createAuthHeaders = async () => {
      // Map facilitator operations to their HTTP paths
      // Keys must match the path names used by @x402/core HTTPFacilitatorClient internally:
      // "verify", "settle", "supported" (not "getSupported")
      const pathMap: Record<string, { method: string; path: string }> = {
        verify: { method: 'POST', path: '/platform/v2/x402/verify' },
        settle: { method: 'POST', path: '/platform/v2/x402/settle' },
        supported: { method: 'GET', path: '/platform/v2/x402/supported' },
      };

      const headers: Record<string, Record<string, string>> = {};
      for (const [op, { method, path }] of Object.entries(pathMap)) {
        const jwt = await generateCdpJwt(
          cdpApiKeyId,
          cdpApiKeySecret,
          method,
          facilitatorHost,
          path
        );
        headers[op] = { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' };
      }
      return headers;
    };

    logger.info('x402: CDP JWT auth configured for facilitator');
  }

  return new HTTPFacilitatorClient(config);
}

let facilitatorClient: HTTPFacilitatorClient | null = null;
const resourceServerByNetwork = new Map<CaipNetwork, x402ResourceServer>();

export type X402GateOptions = {
  price?: string;
  description?: string;
  network?: SupportedNetwork;
};

export type X402RuntimeConfig = {
  enabled: boolean;
  network: SupportedNetwork;
};

function parseEnabledFlag(rawValue: string | undefined): boolean {
  if (!rawValue) return false;
  return ['1', 'true', 'yes', 'on'].includes(rawValue.toLowerCase());
}

function resolveNetwork(override?: SupportedNetwork): SupportedNetwork {
  const networkValue = override ?? process.env.X402_NETWORK ?? 'base-sepolia';
  const parsed = NETWORK_SCHEMA.safeParse(networkValue);
  if (parsed.success) return parsed.data;

  logger.warn(
    { x402Network: networkValue, fallback: 'base-sepolia' },
    'Invalid X402_NETWORK, using base-sepolia'
  );
  return 'base-sepolia';
}

function toCaipNetwork(network: SupportedNetwork): CaipNetwork {
  if (network in LEGACY_TO_CAIP) {
    return LEGACY_TO_CAIP[network as LegacyNetwork];
  }
  return network as CaipNetwork;
}

let resourceServerInitPromise: Promise<void> | null = null;

function getResourceServer(network: CaipNetwork): x402ResourceServer {
  const cached = resourceServerByNetwork.get(network);
  if (cached) return cached;

  if (!facilitatorClient) {
    facilitatorClient = getFacilitatorClient();
  }

  const server = new x402ResourceServer(facilitatorClient).register(
    network,
    new ExactEvmScheme()
  );
  resourceServerByNetwork.set(network, server);

  // Kick off async initialize to fetch supported schemes from facilitator
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resourceServerInitPromise = (server as any).initialize()
    .then(() => logger.info({ network }, 'x402 resource server initialized'))
    .catch((err: unknown) => logger.warn({ err, network }, 'x402 resource server init failed (will retry on request)'));

  return server;
}

function resolveWalletAddress(): `0x${string}` | null {
  const wallet = process.env.X402_WALLET_ADDRESS;
  const parsed = WALLET_SCHEMA.safeParse(wallet);
  if (!parsed.success) return null;
  return parsed.data as `0x${string}`;
}

function buildUnavailableHandler(): RequestHandler {
  return (_req, res) => {
    res.status(503).json({
      error: 'x402_not_configured',
      message: 'x402 is enabled but X402_WALLET_ADDRESS is not configured.'
    });
  };
}

export function isX402Enabled(): boolean {
  return parseEnabledFlag(process.env.X402_ENABLED);
}

export function getX402RuntimeConfig(): X402RuntimeConfig {
  return {
    enabled: isX402Enabled(),
    network: resolveNetwork(),
  };
}

export function createX402Gate(options: X402GateOptions = {}): RequestHandler {
  if (!isX402Enabled()) {
    return (_req, _res, next) => next();
  }

  const payTo = resolveWalletAddress();
  if (!payTo) {
    logger.error('x402 enabled but X402_WALLET_ADDRESS is not a valid EVM address');
    return buildUnavailableHandler();
  }

  const network = resolveNetwork(options.network);
  const caipNetwork = toCaipNetwork(network);
  const gate = paymentMiddleware(
    {
      '*': {
        accepts: {
          scheme: 'exact',
          price: options.price || '$0.01',
          network: caipNetwork,
          payTo,
        },
        description: options.description || 'x402 protected endpoint',
      },
    },
    getResourceServer(caipNetwork),
    undefined,
    undefined,
    false
  );

  return async (req, res, next) => {
    try {
      // Ensure resource server has fetched supported schemes before processing
      if (resourceServerInitPromise) {
        await resourceServerInitPromise;
      }
      await gate(req, res, next);
    } catch (error) {
      logger.error({ err: error }, 'x402 gate failed');
      res.status(500).json({
        error: 'x402_gate_error',
        message: 'Failed to process x402 payment gate.',
      });
    }
  };
}

import type { RequestHandler } from 'express';
import { paymentMiddleware, x402ResourceServer } from '@x402/express';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { HTTPFacilitatorClient } from '@x402/core/server';
import { z } from 'zod';
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

const facilitatorClient = new HTTPFacilitatorClient();
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

function getResourceServer(network: CaipNetwork): x402ResourceServer {
  const cached = resourceServerByNetwork.get(network);
  if (cached) return cached;

  const server = new x402ResourceServer(facilitatorClient).register(
    network,
    new ExactEvmScheme()
  );
  resourceServerByNetwork.set(network, server);
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
    getResourceServer(caipNetwork)
  );

  return async (req, res, next) => {
    try {
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

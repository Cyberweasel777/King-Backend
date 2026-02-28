import type { RequestHandler } from 'express';
import { paymentMiddleware } from 'x402-express';
import type { Network } from 'x402-express';
import { z } from 'zod';
import logger from '../../config/logger';

const SUPPORTED_NETWORKS = ['base-sepolia', 'base'] as const;
const NETWORK_SCHEMA = z.enum(SUPPORTED_NETWORKS);
const WALLET_SCHEMA = z.string().regex(/^0x[a-fA-F0-9]{40}$/);

export type X402GateOptions = {
  price?: string;
  description?: string;
  network?: Network;
};

export type X402RuntimeConfig = {
  enabled: boolean;
  network: Network;
};

function parseEnabledFlag(rawValue: string | undefined): boolean {
  if (!rawValue) return false;
  return ['1', 'true', 'yes', 'on'].includes(rawValue.toLowerCase());
}

function resolveNetwork(override?: Network): Network {
  if (override) return override;

  const networkFromEnv = process.env.X402_NETWORK || 'base-sepolia';
  const parsed = NETWORK_SCHEMA.safeParse(networkFromEnv);
  if (parsed.success) return parsed.data;

  logger.warn(
    { x402Network: networkFromEnv, fallback: 'base-sepolia' },
    'Invalid X402_NETWORK, using base-sepolia'
  );
  return 'base-sepolia';
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
  const gate = paymentMiddleware(payTo, {
    '*': {
      price: options.price || '$0.01',
      network,
      config: {
        description: options.description || 'x402 protected endpoint',
      },
    },
  });

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

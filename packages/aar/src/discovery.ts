import { encodeBase64Url } from './encoding';
import { publicKeyFromSecret } from './sign';
import type { WellKnownAARConfiguration } from './types';

export interface DiscoveryOptions {
  agentId: string;
  agentName?: string;
  agentVersion?: string;
  secretKey: Uint8Array | string;
  receiptHeader?: string;
}

/**
 * Build the well-known AAR configuration object for auto-discovery.
 */
export function buildWellKnownConfig(options: DiscoveryOptions): WellKnownAARConfiguration {
  const pk = publicKeyFromSecret(options.secretKey);
  return {
    specVersion: '1.0',
    canonicalization: 'JCS-SORTED-UTF8-NOWS',
    signatureAlgorithms: ['Ed25519'],
    hashAlgorithms: ['sha256'],
    receiptHeader: options.receiptHeader ?? 'X-AAR-Receipt',
    agent: {
      id: options.agentId,
      name: options.agentName,
      version: options.agentVersion,
      publicKey: encodeBase64Url(pk),
    },
  };
}

/**
 * Express route handler for /.well-known/aar-configuration
 *
 * Usage:
 *   app.get('/.well-known/aar-configuration', wellKnownHandler({ agentId: '...', secretKey: '...' }));
 */
export function wellKnownHandler(options: DiscoveryOptions) {
  const config = buildWellKnownConfig(options);
  return (_req: unknown, res: { json: (data: unknown) => void }): void => {
    res.json(config);
  };
}

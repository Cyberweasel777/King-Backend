declare module '@x402/express' {
  import type { NextFunction, Request, Response } from 'express';

  export type Network = `${string}:${string}`;
  export type Money = string | number;

  export type PaymentOption = {
    scheme: string;
    payTo: string;
    price: Money;
    network: Network;
    maxTimeoutSeconds?: number;
    extra?: Record<string, unknown>;
  };

  export type RouteConfig = {
    accepts: PaymentOption | PaymentOption[];
    resource?: string;
    description?: string;
    mimeType?: string;
    customPaywallHtml?: string;
    extensions?: Record<string, unknown>;
  };

  export type RoutesConfig = Record<string, RouteConfig> | RouteConfig;

  export class x402ResourceServer {
    constructor(facilitatorClients?: unknown);
    register(network: Network, server: unknown): x402ResourceServer;
  }

  export function paymentMiddleware(
    routes: RoutesConfig,
    server: x402ResourceServer,
    paywallConfig?: unknown,
    paywall?: unknown,
    syncFacilitatorOnStart?: boolean
  ): (req: Request, res: Response, next: NextFunction) => Promise<void>;
}

declare module '@x402/core/server' {
  export type FacilitatorConfig = {
    url?: string;
    createAuthHeaders?: () => Promise<{
      verify: Record<string, string>;
      settle: Record<string, string>;
      supported: Record<string, string>;
    }>;
  };

  export class HTTPFacilitatorClient {
    constructor(config?: FacilitatorConfig);
  }
}

declare module '@x402/evm/exact/server' {
  export class ExactEvmScheme {
    readonly scheme: 'exact';
  }
}

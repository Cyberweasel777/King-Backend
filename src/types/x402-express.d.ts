declare module 'x402-express' {
  import type { NextFunction, Request, Response } from 'express';

  export type Network =
    | 'abstract'
    | 'abstract-testnet'
    | 'base-sepolia'
    | 'base'
    | 'avalanche-fuji'
    | 'avalanche'
    | 'iotex'
    | 'solana-devnet'
    | 'solana'
    | 'sei'
    | 'sei-testnet'
    | 'polygon'
    | 'polygon-amoy'
    | 'peaq'
    | 'story'
    | 'educhain'
    | 'skale-base-sepolia';

  export type Money = string | number;

  export type RouteConfig = {
    price: Money;
    network: Network;
    config?: {
      description?: string;
      mimeType?: string;
      maxTimeoutSeconds?: number;
      outputSchema?: Record<string, unknown>;
      customPaywallHtml?: string;
      resource?: `${string}://${string}`;
    };
  };

  export type RoutesConfig = Record<string, Money | RouteConfig>;

  export function paymentMiddleware(
    payTo: string,
    routes: RoutesConfig,
    facilitator?: unknown,
    paywall?: unknown
  ): (req: Request, res: Response, next: NextFunction) => Promise<void>;
}

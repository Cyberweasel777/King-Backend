/**
 * Type-Safe API Contracts
 * 
 * Define once, generate TypeScript types, validation, and client code.
 */

import { z } from 'zod';

// ============================================================================
// SHARED CONTRACTS (All apps use these)
// ============================================================================

export const SubscriptionTier = z.enum(['free', 'basic', 'pro', 'enterprise']);
export const AppId = z.enum([
  'botindex', 'memeradar', 'arbwatch', 'spreadhunter', 
  'deckvault', 'packpal', 'dropfarm', 'dropscout',
  'launchradar', 'nftpulse', 'pointtrack', 'rosterradar',
  'skinsignal', 'socialindex', 'memestock'
]);

// ============================================================================
// FEATURE-SPECIFIC CONTRACTS
// ============================================================================

// Example: Whale Tracking Feature
export const WhaleTrackingContract: {
  requests: { listWhales: z.ZodObject<any>; trackWallet: z.ZodObject<any> };
  responses: { whaleTransaction: z.ZodObject<any>; whaleAlert: z.ZodObject<any> };
  errors: { invalidWallet: z.ZodObject<any>; rateLimited: z.ZodObject<any> };
} = {
  // Request schemas
  requests: {
    listWhales: z.object({
      minAmount: z.number().min(1000).default(10000),
      token: z.string().optional(),
      limit: z.number().max(100).default(20)
    }),
    
    trackWallet: z.object({
      address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
      alerts: z.boolean().default(true)
    })
  },
  
  // Response schemas
  responses: {
    whaleTransaction: z.object({
      id: z.string(),
      wallet: z.string(),
      token: z.string(),
      action: z.enum(['buy', 'sell', 'transfer']),
      amount: z.number(),
      valueUsd: z.number(),
      timestamp: z.string().datetime(),
      txHash: z.string()
    }),
    
    whaleAlert: z.object({
      transaction: z.lazy(() => WhaleTrackingContract.responses.whaleTransaction),
      significance: z.enum(['low', 'medium', 'high', 'critical']),
      reason: z.string()
    })
  },
  
  // Error schemas
  errors: {
    invalidWallet: z.object({
      error: z.literal('INVALID_WALLET'),
      message: z.string(),
      providedAddress: z.string()
    }),
    
    rateLimited: z.object({
      error: z.literal('RATE_LIMITED'),
      message: z.string(),
      retryAfter: z.number()
    })
  }
};

// Example: Arbitrage Detection Feature
export const ArbitrageContract = {
  requests: {
    findOpportunities: z.object({
      minProfit: z.number().min(0.01).default(0.05),
      maxSlippage: z.number().max(0.1).default(0.02),
      pairs: z.array(z.string()).optional()
    }),
    
    executeArbitrage: z.object({
      opportunityId: z.string(),
      amount: z.number().positive(),
      autoExecute: z.boolean().default(false)
    })
  },
  
  responses: {
    opportunity: z.object({
      id: z.string(),
      pair: z.string(),
      buyMarket: z.string(),
      sellMarket: z.string(),
      buyPrice: z.number(),
      sellPrice: z.number(),
      spread: z.number(),
      netProfit: z.number(),
      confidence: z.number().min(0).max(1),
      expiresAt: z.string().datetime()
    }),
    
    executionResult: z.object({
      success: z.boolean(),
      opportunityId: z.string(),
      executedAt: z.string().datetime(),
      profit: z.number(),
      fees: z.number(),
      netProfit: z.number(),
      txHashes: z.array(z.string())
    })
  },
  
  errors: {
    opportunityExpired: z.object({
      error: z.literal('OPPORTUNITY_EXPIRED'),
      message: z.string(),
      expiredAt: z.string().datetime()
    }),
    
    insufficientFunds: z.object({
      error: z.literal('INSUFFICIENT_FUNDS'),
      message: z.string(),
      required: z.number(),
      available: z.number()
    })
  }
};

// ============================================================================
// CONTRACT REGISTRY
// ============================================================================

export const FeatureContracts = {
  whaleTracking: WhaleTrackingContract,
  arbitrage: ArbitrageContract,
  // Add more features here
};

// ============================================================================
// TYPE GENERATION
// ============================================================================

export type WhaleTransaction = z.infer<typeof WhaleTrackingContract.responses.whaleTransaction>;
export type WhaleAlert = z.infer<typeof WhaleTrackingContract.responses.whaleAlert>;
export type ArbitrageOpportunity = z.infer<typeof ArbitrageContract.responses.opportunity>;
export type ArbitrageResult = z.infer<typeof ArbitrageContract.responses.executionResult>;

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

export function validateRequest<T>(contract: z.ZodType<T>, data: unknown): T {
  return contract.parse(data);
}

export function validateResponse<T>(contract: z.ZodType<T>, data: unknown): T {
  return contract.parse(data);
}

// ============================================================================
// BOT COMMAND CONTRACTS
// ============================================================================

export const BotCommandContract = z.object({
  name: z.string().regex(/^\/[a-z0-9-]+$/),
  description: z.string().max(100),
  tier: SubscriptionTier,
  params: z.array(z.object({
    name: z.string(),
    type: z.enum(['string', 'number', 'boolean']),
    required: z.boolean(),
    description: z.string()
  })).optional(),
  response: z.object({
    type: z.enum(['text', 'markdown', 'json', 'image']),
    template: z.string().optional()
  })
});

export type BotCommand = z.infer<typeof BotCommandContract>;

// ============================================================================
// APP CONFIG CONTRACT
// ============================================================================

export const AppFeatureConfig = z.object({
  appId: AppId,
  features: z.record(z.object({
    enabled: z.boolean(),
    tier: SubscriptionTier,
    limits: z.record(z.number().or(z.literal(Infinity))),
    commands: z.array(BotCommandContract)
  }))
});

export type AppConfig = z.infer<typeof AppFeatureConfig>;

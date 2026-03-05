"use strict";
/**
 * Type-Safe API Contracts
 *
 * Define once, generate TypeScript types, validation, and client code.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppFeatureConfig = exports.BotCommandContract = exports.FeatureContracts = exports.PaymentRailsExecutionContract = exports.PaymentRailRouteContract = exports.ArbitrageContract = exports.WhaleTrackingContract = exports.AppId = exports.SubscriptionTier = void 0;
exports.validateRequest = validateRequest;
exports.validateResponse = validateResponse;
const zod_1 = require("zod");
// ============================================================================
// SHARED CONTRACTS (All apps use these)
// ============================================================================
exports.SubscriptionTier = zod_1.z.enum(['free', 'starter', 'basic', 'pro', 'elite', 'enterprise']);
exports.AppId = zod_1.z.enum([
    'botindex', 'memeradar', 'arbwatch', 'spreadhunter',
    'deckvault', 'packpal', 'dropfarm', 'dropscout',
    'launchradar', 'nftpulse', 'pointtrack', 'rosterradar',
    'skinsignal', 'socialindex', 'memestock'
]);
// ============================================================================
// FEATURE-SPECIFIC CONTRACTS
// ============================================================================
// Example: Whale Tracking Feature
exports.WhaleTrackingContract = {
    // Request schemas
    requests: {
        listWhales: zod_1.z.object({
            minAmount: zod_1.z.number().min(1000).default(10000),
            token: zod_1.z.string().optional(),
            limit: zod_1.z.number().max(100).default(20)
        }),
        trackWallet: zod_1.z.object({
            address: zod_1.z.string().regex(/^0x[a-fA-F0-9]{40}$/),
            alerts: zod_1.z.boolean().default(true)
        })
    },
    // Response schemas
    responses: {
        whaleTransaction: zod_1.z.object({
            id: zod_1.z.string(),
            wallet: zod_1.z.string(),
            token: zod_1.z.string(),
            action: zod_1.z.enum(['buy', 'sell', 'transfer']),
            amount: zod_1.z.number(),
            valueUsd: zod_1.z.number(),
            timestamp: zod_1.z.string().datetime(),
            txHash: zod_1.z.string()
        }),
        whaleAlert: zod_1.z.object({
            transaction: zod_1.z.lazy(() => exports.WhaleTrackingContract.responses.whaleTransaction),
            significance: zod_1.z.enum(['low', 'medium', 'high', 'critical']),
            reason: zod_1.z.string()
        })
    },
    // Error schemas
    errors: {
        invalidWallet: zod_1.z.object({
            error: zod_1.z.literal('INVALID_WALLET'),
            message: zod_1.z.string(),
            providedAddress: zod_1.z.string()
        }),
        rateLimited: zod_1.z.object({
            error: zod_1.z.literal('RATE_LIMITED'),
            message: zod_1.z.string(),
            retryAfter: zod_1.z.number()
        })
    }
};
// Example: Arbitrage Detection Feature
exports.ArbitrageContract = {
    requests: {
        findOpportunities: zod_1.z.object({
            minProfit: zod_1.z.number().min(0.01).default(0.05),
            maxSlippage: zod_1.z.number().max(0.1).default(0.02),
            pairs: zod_1.z.array(zod_1.z.string()).optional()
        }),
        executeArbitrage: zod_1.z.object({
            opportunityId: zod_1.z.string(),
            amount: zod_1.z.number().positive(),
            autoExecute: zod_1.z.boolean().default(false)
        })
    },
    responses: {
        opportunity: zod_1.z.object({
            id: zod_1.z.string(),
            pair: zod_1.z.string(),
            buyMarket: zod_1.z.string(),
            sellMarket: zod_1.z.string(),
            buyPrice: zod_1.z.number(),
            sellPrice: zod_1.z.number(),
            spread: zod_1.z.number(),
            netProfit: zod_1.z.number(),
            confidence: zod_1.z.number().min(0).max(1),
            expiresAt: zod_1.z.string().datetime()
        }),
        executionResult: zod_1.z.object({
            success: zod_1.z.boolean(),
            opportunityId: zod_1.z.string(),
            executedAt: zod_1.z.string().datetime(),
            profit: zod_1.z.number(),
            fees: zod_1.z.number(),
            netProfit: zod_1.z.number(),
            txHashes: zod_1.z.array(zod_1.z.string())
        })
    },
    errors: {
        opportunityExpired: zod_1.z.object({
            error: zod_1.z.literal('OPPORTUNITY_EXPIRED'),
            message: zod_1.z.string(),
            expiredAt: zod_1.z.string().datetime()
        }),
        insufficientFunds: zod_1.z.object({
            error: zod_1.z.literal('INSUFFICIENT_FUNDS'),
            message: zod_1.z.string(),
            required: zod_1.z.number(),
            available: zod_1.z.number()
        })
    }
};
// ============================================================================
// CONTRACT REGISTRY
// ============================================================================
exports.PaymentRailRouteContract = zod_1.z.object({
    id: zod_1.z.enum(['P1', 'P2', 'P3', 'P4', 'P5']),
    appId: zod_1.z.string(),
    checkoutPath: zod_1.z.string(),
    statusPath: zod_1.z.string(),
    configPath: zod_1.z.string(),
    defaultTier: exports.SubscriptionTier.optional(),
    note: zod_1.z.string().optional(),
});
exports.PaymentRailsExecutionContract = zod_1.z.object({
    generatedAt: zod_1.z.string(),
    p1ToP5: zod_1.z.array(exports.PaymentRailRouteContract),
    defaults: zod_1.z.object({
        additiveOnly: zod_1.z.boolean(),
        defaultEnabled: zod_1.z.boolean(),
        safeRollout: zod_1.z.boolean(),
    }),
});
exports.FeatureContracts = {
    whaleTracking: exports.WhaleTrackingContract,
    arbitrage: exports.ArbitrageContract,
    paymentRailsExecution: exports.PaymentRailsExecutionContract,
    // Add more features here
};
// ============================================================================
// VALIDATION HELPERS
// ============================================================================
function validateRequest(contract, data) {
    return contract.parse(data);
}
function validateResponse(contract, data) {
    return contract.parse(data);
}
// ============================================================================
// BOT COMMAND CONTRACTS
// ============================================================================
exports.BotCommandContract = zod_1.z.object({
    name: zod_1.z.string().regex(/^\/[a-z0-9-]+$/),
    description: zod_1.z.string().max(100),
    tier: exports.SubscriptionTier,
    params: zod_1.z.array(zod_1.z.object({
        name: zod_1.z.string(),
        type: zod_1.z.enum(['string', 'number', 'boolean']),
        required: zod_1.z.boolean(),
        description: zod_1.z.string()
    })).optional(),
    response: zod_1.z.object({
        type: zod_1.z.enum(['text', 'markdown', 'json', 'image']),
        template: zod_1.z.string().optional()
    })
});
// ============================================================================
// APP CONFIG CONTRACT
// ============================================================================
exports.AppFeatureConfig = zod_1.z.object({
    appId: exports.AppId,
    features: zod_1.z.record(zod_1.z.object({
        enabled: zod_1.z.boolean(),
        tier: exports.SubscriptionTier,
        limits: zod_1.z.record(zod_1.z.number().or(zod_1.z.literal(Infinity))),
        commands: zod_1.z.array(exports.BotCommandContract)
    }))
});
//# sourceMappingURL=contracts.js.map
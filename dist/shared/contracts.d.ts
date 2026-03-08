/**
 * Type-Safe API Contracts
 *
 * Define once, generate TypeScript types, validation, and client code.
 */
import { z } from 'zod';
export declare const SubscriptionTier: z.ZodEnum<["free", "starter", "basic", "pro", "elite", "enterprise"]>;
export declare const AppId: z.ZodEnum<["botindex", "memeradar", "arbwatch", "spreadhunter", "deckvault", "packpal", "dropfarm", "dropscout", "launchradar", "nftpulse", "pointtrack", "rosterradar", "skinsignal", "socialindex", "memestock"]>;
export declare const WhaleTrackingContract: {
    requests: {
        listWhales: z.ZodObject<any>;
        trackWallet: z.ZodObject<any>;
    };
    responses: {
        whaleTransaction: z.ZodObject<any>;
        whaleAlert: z.ZodObject<any>;
    };
    errors: {
        invalidWallet: z.ZodObject<any>;
        rateLimited: z.ZodObject<any>;
    };
};
export declare const ArbitrageContract: {
    requests: {
        findOpportunities: z.ZodObject<{
            minProfit: z.ZodDefault<z.ZodNumber>;
            maxSlippage: z.ZodDefault<z.ZodNumber>;
            pairs: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            minProfit: number;
            maxSlippage: number;
            pairs?: string[] | undefined;
        }, {
            pairs?: string[] | undefined;
            minProfit?: number | undefined;
            maxSlippage?: number | undefined;
        }>;
        executeArbitrage: z.ZodObject<{
            opportunityId: z.ZodString;
            amount: z.ZodNumber;
            autoExecute: z.ZodDefault<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            amount: number;
            opportunityId: string;
            autoExecute: boolean;
        }, {
            amount: number;
            opportunityId: string;
            autoExecute?: boolean | undefined;
        }>;
    };
    responses: {
        opportunity: z.ZodObject<{
            id: z.ZodString;
            pair: z.ZodString;
            buyMarket: z.ZodString;
            sellMarket: z.ZodString;
            buyPrice: z.ZodNumber;
            sellPrice: z.ZodNumber;
            spread: z.ZodNumber;
            netProfit: z.ZodNumber;
            confidence: z.ZodNumber;
            expiresAt: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            expiresAt: string;
            id: string;
            spread: number;
            confidence: number;
            pair: string;
            buyMarket: string;
            sellMarket: string;
            buyPrice: number;
            sellPrice: number;
            netProfit: number;
        }, {
            expiresAt: string;
            id: string;
            spread: number;
            confidence: number;
            pair: string;
            buyMarket: string;
            sellMarket: string;
            buyPrice: number;
            sellPrice: number;
            netProfit: number;
        }>;
        executionResult: z.ZodObject<{
            success: z.ZodBoolean;
            opportunityId: z.ZodString;
            executedAt: z.ZodString;
            profit: z.ZodNumber;
            fees: z.ZodNumber;
            netProfit: z.ZodNumber;
            txHashes: z.ZodArray<z.ZodString, "many">;
        }, "strip", z.ZodTypeAny, {
            success: boolean;
            opportunityId: string;
            profit: number;
            netProfit: number;
            executedAt: string;
            fees: number;
            txHashes: string[];
        }, {
            success: boolean;
            opportunityId: string;
            profit: number;
            netProfit: number;
            executedAt: string;
            fees: number;
            txHashes: string[];
        }>;
    };
    errors: {
        opportunityExpired: z.ZodObject<{
            error: z.ZodLiteral<"OPPORTUNITY_EXPIRED">;
            message: z.ZodString;
            expiredAt: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            error: "OPPORTUNITY_EXPIRED";
            message: string;
            expiredAt: string;
        }, {
            error: "OPPORTUNITY_EXPIRED";
            message: string;
            expiredAt: string;
        }>;
        insufficientFunds: z.ZodObject<{
            error: z.ZodLiteral<"INSUFFICIENT_FUNDS">;
            message: z.ZodString;
            required: z.ZodNumber;
            available: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            error: "INSUFFICIENT_FUNDS";
            message: string;
            available: number;
            required: number;
        }, {
            error: "INSUFFICIENT_FUNDS";
            message: string;
            available: number;
            required: number;
        }>;
    };
};
export declare const PaymentRailRouteContract: z.ZodObject<{
    id: z.ZodEnum<["P1", "P2", "P3", "P4", "P5"]>;
    appId: z.ZodString;
    checkoutPath: z.ZodString;
    statusPath: z.ZodString;
    configPath: z.ZodString;
    defaultTier: z.ZodOptional<z.ZodEnum<["free", "starter", "basic", "pro", "elite", "enterprise"]>>;
    note: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: "P1" | "P2" | "P3" | "P4" | "P5";
    appId: string;
    checkoutPath: string;
    statusPath: string;
    configPath: string;
    note?: string | undefined;
    defaultTier?: "free" | "basic" | "pro" | "starter" | "elite" | "enterprise" | undefined;
}, {
    id: "P1" | "P2" | "P3" | "P4" | "P5";
    appId: string;
    checkoutPath: string;
    statusPath: string;
    configPath: string;
    note?: string | undefined;
    defaultTier?: "free" | "basic" | "pro" | "starter" | "elite" | "enterprise" | undefined;
}>;
export declare const PaymentRailsExecutionContract: z.ZodObject<{
    generatedAt: z.ZodString;
    p1ToP5: z.ZodArray<z.ZodObject<{
        id: z.ZodEnum<["P1", "P2", "P3", "P4", "P5"]>;
        appId: z.ZodString;
        checkoutPath: z.ZodString;
        statusPath: z.ZodString;
        configPath: z.ZodString;
        defaultTier: z.ZodOptional<z.ZodEnum<["free", "starter", "basic", "pro", "elite", "enterprise"]>>;
        note: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        id: "P1" | "P2" | "P3" | "P4" | "P5";
        appId: string;
        checkoutPath: string;
        statusPath: string;
        configPath: string;
        note?: string | undefined;
        defaultTier?: "free" | "basic" | "pro" | "starter" | "elite" | "enterprise" | undefined;
    }, {
        id: "P1" | "P2" | "P3" | "P4" | "P5";
        appId: string;
        checkoutPath: string;
        statusPath: string;
        configPath: string;
        note?: string | undefined;
        defaultTier?: "free" | "basic" | "pro" | "starter" | "elite" | "enterprise" | undefined;
    }>, "many">;
    defaults: z.ZodObject<{
        additiveOnly: z.ZodBoolean;
        defaultEnabled: z.ZodBoolean;
        safeRollout: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        additiveOnly: boolean;
        defaultEnabled: boolean;
        safeRollout: boolean;
    }, {
        additiveOnly: boolean;
        defaultEnabled: boolean;
        safeRollout: boolean;
    }>;
}, "strip", z.ZodTypeAny, {
    generatedAt: string;
    p1ToP5: {
        id: "P1" | "P2" | "P3" | "P4" | "P5";
        appId: string;
        checkoutPath: string;
        statusPath: string;
        configPath: string;
        note?: string | undefined;
        defaultTier?: "free" | "basic" | "pro" | "starter" | "elite" | "enterprise" | undefined;
    }[];
    defaults: {
        additiveOnly: boolean;
        defaultEnabled: boolean;
        safeRollout: boolean;
    };
}, {
    generatedAt: string;
    p1ToP5: {
        id: "P1" | "P2" | "P3" | "P4" | "P5";
        appId: string;
        checkoutPath: string;
        statusPath: string;
        configPath: string;
        note?: string | undefined;
        defaultTier?: "free" | "basic" | "pro" | "starter" | "elite" | "enterprise" | undefined;
    }[];
    defaults: {
        additiveOnly: boolean;
        defaultEnabled: boolean;
        safeRollout: boolean;
    };
}>;
export declare const FeatureContracts: {
    whaleTracking: {
        requests: {
            listWhales: z.ZodObject<any>;
            trackWallet: z.ZodObject<any>;
        };
        responses: {
            whaleTransaction: z.ZodObject<any>;
            whaleAlert: z.ZodObject<any>;
        };
        errors: {
            invalidWallet: z.ZodObject<any>;
            rateLimited: z.ZodObject<any>;
        };
    };
    arbitrage: {
        requests: {
            findOpportunities: z.ZodObject<{
                minProfit: z.ZodDefault<z.ZodNumber>;
                maxSlippage: z.ZodDefault<z.ZodNumber>;
                pairs: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            }, "strip", z.ZodTypeAny, {
                minProfit: number;
                maxSlippage: number;
                pairs?: string[] | undefined;
            }, {
                pairs?: string[] | undefined;
                minProfit?: number | undefined;
                maxSlippage?: number | undefined;
            }>;
            executeArbitrage: z.ZodObject<{
                opportunityId: z.ZodString;
                amount: z.ZodNumber;
                autoExecute: z.ZodDefault<z.ZodBoolean>;
            }, "strip", z.ZodTypeAny, {
                amount: number;
                opportunityId: string;
                autoExecute: boolean;
            }, {
                amount: number;
                opportunityId: string;
                autoExecute?: boolean | undefined;
            }>;
        };
        responses: {
            opportunity: z.ZodObject<{
                id: z.ZodString;
                pair: z.ZodString;
                buyMarket: z.ZodString;
                sellMarket: z.ZodString;
                buyPrice: z.ZodNumber;
                sellPrice: z.ZodNumber;
                spread: z.ZodNumber;
                netProfit: z.ZodNumber;
                confidence: z.ZodNumber;
                expiresAt: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                expiresAt: string;
                id: string;
                spread: number;
                confidence: number;
                pair: string;
                buyMarket: string;
                sellMarket: string;
                buyPrice: number;
                sellPrice: number;
                netProfit: number;
            }, {
                expiresAt: string;
                id: string;
                spread: number;
                confidence: number;
                pair: string;
                buyMarket: string;
                sellMarket: string;
                buyPrice: number;
                sellPrice: number;
                netProfit: number;
            }>;
            executionResult: z.ZodObject<{
                success: z.ZodBoolean;
                opportunityId: z.ZodString;
                executedAt: z.ZodString;
                profit: z.ZodNumber;
                fees: z.ZodNumber;
                netProfit: z.ZodNumber;
                txHashes: z.ZodArray<z.ZodString, "many">;
            }, "strip", z.ZodTypeAny, {
                success: boolean;
                opportunityId: string;
                profit: number;
                netProfit: number;
                executedAt: string;
                fees: number;
                txHashes: string[];
            }, {
                success: boolean;
                opportunityId: string;
                profit: number;
                netProfit: number;
                executedAt: string;
                fees: number;
                txHashes: string[];
            }>;
        };
        errors: {
            opportunityExpired: z.ZodObject<{
                error: z.ZodLiteral<"OPPORTUNITY_EXPIRED">;
                message: z.ZodString;
                expiredAt: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                error: "OPPORTUNITY_EXPIRED";
                message: string;
                expiredAt: string;
            }, {
                error: "OPPORTUNITY_EXPIRED";
                message: string;
                expiredAt: string;
            }>;
            insufficientFunds: z.ZodObject<{
                error: z.ZodLiteral<"INSUFFICIENT_FUNDS">;
                message: z.ZodString;
                required: z.ZodNumber;
                available: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                error: "INSUFFICIENT_FUNDS";
                message: string;
                available: number;
                required: number;
            }, {
                error: "INSUFFICIENT_FUNDS";
                message: string;
                available: number;
                required: number;
            }>;
        };
    };
    paymentRailsExecution: z.ZodObject<{
        generatedAt: z.ZodString;
        p1ToP5: z.ZodArray<z.ZodObject<{
            id: z.ZodEnum<["P1", "P2", "P3", "P4", "P5"]>;
            appId: z.ZodString;
            checkoutPath: z.ZodString;
            statusPath: z.ZodString;
            configPath: z.ZodString;
            defaultTier: z.ZodOptional<z.ZodEnum<["free", "starter", "basic", "pro", "elite", "enterprise"]>>;
            note: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            id: "P1" | "P2" | "P3" | "P4" | "P5";
            appId: string;
            checkoutPath: string;
            statusPath: string;
            configPath: string;
            note?: string | undefined;
            defaultTier?: "free" | "basic" | "pro" | "starter" | "elite" | "enterprise" | undefined;
        }, {
            id: "P1" | "P2" | "P3" | "P4" | "P5";
            appId: string;
            checkoutPath: string;
            statusPath: string;
            configPath: string;
            note?: string | undefined;
            defaultTier?: "free" | "basic" | "pro" | "starter" | "elite" | "enterprise" | undefined;
        }>, "many">;
        defaults: z.ZodObject<{
            additiveOnly: z.ZodBoolean;
            defaultEnabled: z.ZodBoolean;
            safeRollout: z.ZodBoolean;
        }, "strip", z.ZodTypeAny, {
            additiveOnly: boolean;
            defaultEnabled: boolean;
            safeRollout: boolean;
        }, {
            additiveOnly: boolean;
            defaultEnabled: boolean;
            safeRollout: boolean;
        }>;
    }, "strip", z.ZodTypeAny, {
        generatedAt: string;
        p1ToP5: {
            id: "P1" | "P2" | "P3" | "P4" | "P5";
            appId: string;
            checkoutPath: string;
            statusPath: string;
            configPath: string;
            note?: string | undefined;
            defaultTier?: "free" | "basic" | "pro" | "starter" | "elite" | "enterprise" | undefined;
        }[];
        defaults: {
            additiveOnly: boolean;
            defaultEnabled: boolean;
            safeRollout: boolean;
        };
    }, {
        generatedAt: string;
        p1ToP5: {
            id: "P1" | "P2" | "P3" | "P4" | "P5";
            appId: string;
            checkoutPath: string;
            statusPath: string;
            configPath: string;
            note?: string | undefined;
            defaultTier?: "free" | "basic" | "pro" | "starter" | "elite" | "enterprise" | undefined;
        }[];
        defaults: {
            additiveOnly: boolean;
            defaultEnabled: boolean;
            safeRollout: boolean;
        };
    }>;
};
export type WhaleTransaction = z.infer<typeof WhaleTrackingContract.responses.whaleTransaction>;
export type WhaleAlert = z.infer<typeof WhaleTrackingContract.responses.whaleAlert>;
export type ArbitrageOpportunity = z.infer<typeof ArbitrageContract.responses.opportunity>;
export type ArbitrageResult = z.infer<typeof ArbitrageContract.responses.executionResult>;
export type PaymentRailRoute = z.infer<typeof PaymentRailRouteContract>;
export type PaymentRailsExecution = z.infer<typeof PaymentRailsExecutionContract>;
export declare function validateRequest<T>(contract: z.ZodType<T>, data: unknown): T;
export declare function validateResponse<T>(contract: z.ZodType<T>, data: unknown): T;
export declare const BotCommandContract: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodString;
    tier: z.ZodEnum<["free", "starter", "basic", "pro", "elite", "enterprise"]>;
    params: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        type: z.ZodEnum<["string", "number", "boolean"]>;
        required: z.ZodBoolean;
        description: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        name: string;
        type: "string" | "number" | "boolean";
        description: string;
        required: boolean;
    }, {
        name: string;
        type: "string" | "number" | "boolean";
        description: string;
        required: boolean;
    }>, "many">>;
    response: z.ZodObject<{
        type: z.ZodEnum<["text", "markdown", "json", "image"]>;
        template: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        type: "text" | "image" | "json" | "markdown";
        template?: string | undefined;
    }, {
        type: "text" | "image" | "json" | "markdown";
        template?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    name: string;
    tier: "free" | "basic" | "pro" | "starter" | "elite" | "enterprise";
    description: string;
    response: {
        type: "text" | "image" | "json" | "markdown";
        template?: string | undefined;
    };
    params?: {
        name: string;
        type: "string" | "number" | "boolean";
        description: string;
        required: boolean;
    }[] | undefined;
}, {
    name: string;
    tier: "free" | "basic" | "pro" | "starter" | "elite" | "enterprise";
    description: string;
    response: {
        type: "text" | "image" | "json" | "markdown";
        template?: string | undefined;
    };
    params?: {
        name: string;
        type: "string" | "number" | "boolean";
        description: string;
        required: boolean;
    }[] | undefined;
}>;
export type BotCommand = z.infer<typeof BotCommandContract>;
export declare const AppFeatureConfig: z.ZodObject<{
    appId: z.ZodEnum<["botindex", "memeradar", "arbwatch", "spreadhunter", "deckvault", "packpal", "dropfarm", "dropscout", "launchradar", "nftpulse", "pointtrack", "rosterradar", "skinsignal", "socialindex", "memestock"]>;
    features: z.ZodRecord<z.ZodString, z.ZodObject<{
        enabled: z.ZodBoolean;
        tier: z.ZodEnum<["free", "starter", "basic", "pro", "elite", "enterprise"]>;
        limits: z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodNumber, z.ZodLiteral<number>]>>;
        commands: z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            description: z.ZodString;
            tier: z.ZodEnum<["free", "starter", "basic", "pro", "elite", "enterprise"]>;
            params: z.ZodOptional<z.ZodArray<z.ZodObject<{
                name: z.ZodString;
                type: z.ZodEnum<["string", "number", "boolean"]>;
                required: z.ZodBoolean;
                description: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                name: string;
                type: "string" | "number" | "boolean";
                description: string;
                required: boolean;
            }, {
                name: string;
                type: "string" | "number" | "boolean";
                description: string;
                required: boolean;
            }>, "many">>;
            response: z.ZodObject<{
                type: z.ZodEnum<["text", "markdown", "json", "image"]>;
                template: z.ZodOptional<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                type: "text" | "image" | "json" | "markdown";
                template?: string | undefined;
            }, {
                type: "text" | "image" | "json" | "markdown";
                template?: string | undefined;
            }>;
        }, "strip", z.ZodTypeAny, {
            name: string;
            tier: "free" | "basic" | "pro" | "starter" | "elite" | "enterprise";
            description: string;
            response: {
                type: "text" | "image" | "json" | "markdown";
                template?: string | undefined;
            };
            params?: {
                name: string;
                type: "string" | "number" | "boolean";
                description: string;
                required: boolean;
            }[] | undefined;
        }, {
            name: string;
            tier: "free" | "basic" | "pro" | "starter" | "elite" | "enterprise";
            description: string;
            response: {
                type: "text" | "image" | "json" | "markdown";
                template?: string | undefined;
            };
            params?: {
                name: string;
                type: "string" | "number" | "boolean";
                description: string;
                required: boolean;
            }[] | undefined;
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        tier: "free" | "basic" | "pro" | "starter" | "elite" | "enterprise";
        limits: Record<string, number>;
        enabled: boolean;
        commands: {
            name: string;
            tier: "free" | "basic" | "pro" | "starter" | "elite" | "enterprise";
            description: string;
            response: {
                type: "text" | "image" | "json" | "markdown";
                template?: string | undefined;
            };
            params?: {
                name: string;
                type: "string" | "number" | "boolean";
                description: string;
                required: boolean;
            }[] | undefined;
        }[];
    }, {
        tier: "free" | "basic" | "pro" | "starter" | "elite" | "enterprise";
        limits: Record<string, number>;
        enabled: boolean;
        commands: {
            name: string;
            tier: "free" | "basic" | "pro" | "starter" | "elite" | "enterprise";
            description: string;
            response: {
                type: "text" | "image" | "json" | "markdown";
                template?: string | undefined;
            };
            params?: {
                name: string;
                type: "string" | "number" | "boolean";
                description: string;
                required: boolean;
            }[] | undefined;
        }[];
    }>>;
}, "strip", z.ZodTypeAny, {
    appId: "spreadhunter" | "deckvault" | "packpal" | "dropfarm" | "dropscout" | "launchradar" | "memeradar" | "memestock" | "nftpulse" | "pointtrack" | "rosterradar" | "skinsignal" | "socialindex" | "botindex" | "arbwatch";
    features: Record<string, {
        tier: "free" | "basic" | "pro" | "starter" | "elite" | "enterprise";
        limits: Record<string, number>;
        enabled: boolean;
        commands: {
            name: string;
            tier: "free" | "basic" | "pro" | "starter" | "elite" | "enterprise";
            description: string;
            response: {
                type: "text" | "image" | "json" | "markdown";
                template?: string | undefined;
            };
            params?: {
                name: string;
                type: "string" | "number" | "boolean";
                description: string;
                required: boolean;
            }[] | undefined;
        }[];
    }>;
}, {
    appId: "spreadhunter" | "deckvault" | "packpal" | "dropfarm" | "dropscout" | "launchradar" | "memeradar" | "memestock" | "nftpulse" | "pointtrack" | "rosterradar" | "skinsignal" | "socialindex" | "botindex" | "arbwatch";
    features: Record<string, {
        tier: "free" | "basic" | "pro" | "starter" | "elite" | "enterprise";
        limits: Record<string, number>;
        enabled: boolean;
        commands: {
            name: string;
            tier: "free" | "basic" | "pro" | "starter" | "elite" | "enterprise";
            description: string;
            response: {
                type: "text" | "image" | "json" | "markdown";
                template?: string | undefined;
            };
            params?: {
                name: string;
                type: "string" | "number" | "boolean";
                description: string;
                required: boolean;
            }[] | undefined;
        }[];
    }>;
}>;
export type AppConfig = z.infer<typeof AppFeatureConfig>;
//# sourceMappingURL=contracts.d.ts.map
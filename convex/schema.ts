import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  subscriptions: defineTable({
    appId: v.string(),
    externalUserId: v.string(),
    userId: v.optional(v.union(v.string(), v.null())),
    stripeCustomerId: v.optional(v.union(v.string(), v.null())),
    stripeSubscriptionId: v.optional(v.union(v.string(), v.null())),
    tier: v.string(),
    status: v.string(),
    currentPeriodStart: v.optional(v.union(v.string(), v.null())),
    currentPeriodEnd: v.optional(v.union(v.string(), v.null())),
    grandfathered: v.optional(v.boolean()),
    grandfatheredFromTier: v.optional(v.union(v.string(), v.null())),
    grandfatheredGraceEnd: v.optional(v.union(v.string(), v.null())),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index('by_app_external', ['appId', 'externalUserId'])
    .index('by_stripe_customer', ['stripeCustomerId'])
    .index('by_app', ['appId']),

  paymentEvents: defineTable({
    appId: v.string(),
    eventType: v.string(),
    stripeEventId: v.string(),
    userId: v.optional(v.string()),
    externalUserId: v.optional(v.string()),
    amount: v.optional(v.number()),
    currency: v.optional(v.string()),
    tier: v.optional(v.string()),
    metadata: v.optional(v.any()),
    createdAt: v.string(),
  })
    .index('by_stripe_event_id', ['stripeEventId'])
    .index('by_app_created', ['appId', 'createdAt'])
    .index('by_app_event_created', ['appId', 'eventType', 'createdAt']),

  referralCodes: defineTable({
    appId: v.string(),
    externalUserId: v.string(),
    code: v.string(),
    createdAt: v.string(),
  })
    .index('by_app_external', ['appId', 'externalUserId'])
    .index('by_app_code', ['appId', 'code']),

  referralConversions: defineTable({
    appId: v.string(),
    referrerExternalUserId: v.string(),
    referredExternalUserId: v.string(),
    checkoutSessionId: v.optional(v.string()),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    status: v.string(),
    rewardMonths: v.number(),
    payoutCents: v.number(),
    convertedAt: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
    metadata: v.optional(v.any()),
  })
    .index('by_app_referred', ['appId', 'referredExternalUserId'])
    .index('by_app_referrer', ['appId', 'referrerExternalUserId']),

  apiRequests: defineTable({
    endpoint: v.string(),
    method: v.string(),
    visitorHash: v.string(),
    walletAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    referrer: v.optional(v.string()),
    statusCode: v.number(),
    x402Paid: v.boolean(),
    responseTimeMs: v.optional(v.number()),
    timestamp: v.number(),
    apiKeyHash: v.optional(v.string()),
    apiKeyPlan: v.optional(v.string()),
  })
    .index('by_endpoint_timestamp', ['endpoint', 'timestamp'])
    .index('by_visitor', ['visitorHash'])
    .index('by_wallet', ['walletAddress'])
    .index('by_timestamp', ['timestamp'])
    .index('by_apiKey', ['apiKeyHash', 'timestamp']),

  wallets: defineTable({
    address: v.string(),
    firstSeen: v.number(),
    lastSeen: v.number(),
    totalRequests: v.number(),
    totalPaidUsd: v.number(),
    endpoints: v.array(v.string()),
  })
    .index('by_address', ['address'])
    .index('by_firstSeen', ['firstSeen']),
});

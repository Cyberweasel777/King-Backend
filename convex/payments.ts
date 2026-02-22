import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

const subscriptionUpdateValidator = v.object({
  userId: v.optional(v.union(v.string(), v.null())),
  stripeCustomerId: v.optional(v.union(v.string(), v.null())),
  stripeSubscriptionId: v.optional(v.union(v.string(), v.null())),
  tier: v.optional(v.string()),
  status: v.optional(v.string()),
  currentPeriodStart: v.optional(v.union(v.string(), v.null())),
  currentPeriodEnd: v.optional(v.union(v.string(), v.null())),
  grandfathered: v.optional(v.boolean()),
  grandfatheredFromTier: v.optional(v.union(v.string(), v.null())),
  grandfatheredGraceEnd: v.optional(v.union(v.string(), v.null())),
});

export const getSubscription = query({
  args: { appId: v.string(), externalUserId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('subscriptions')
      .withIndex('by_app_external', (q) => q.eq('appId', args.appId).eq('externalUserId', args.externalUserId))
      .unique();
  },
});

export const getSubscriptionByStripeCustomer = query({
  args: { stripeCustomerId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('subscriptions')
      .withIndex('by_stripe_customer', (q) => q.eq('stripeCustomerId', args.stripeCustomerId))
      .unique();
  },
});

export const listSubscriptionsByApp = query({
  args: { appId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db.query('subscriptions').withIndex('by_app', (q) => q.eq('appId', args.appId)).collect();
  },
});

export const upsertSubscription = mutation({
  args: { appId: v.string(), externalUserId: v.string(), updates: subscriptionUpdateValidator },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const existing = await ctx.db
      .query('subscriptions')
      .withIndex('by_app_external', (q) => q.eq('appId', args.appId).eq('externalUserId', args.externalUserId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args.updates,
        updatedAt: now,
      });
      return (await ctx.db.get(existing._id))!;
    }

    const id = await ctx.db.insert('subscriptions', {
      appId: args.appId,
      externalUserId: args.externalUserId,
      tier: args.updates.tier || 'free',
      status: args.updates.status || 'inactive',
      ...args.updates,
      createdAt: now,
      updatedAt: now,
    });

    return (await ctx.db.get(id))!;
  },
});

export const recordPaymentEvent = mutation({
  args: {
    event: v.object({
      appId: v.string(),
      eventType: v.string(),
      stripeEventId: v.string(),
      userId: v.optional(v.string()),
      externalUserId: v.optional(v.string()),
      amount: v.optional(v.number()),
      currency: v.optional(v.string()),
      tier: v.optional(v.string()),
      metadata: v.optional(v.any()),
    }),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('paymentEvents')
      .withIndex('by_stripe_event_id', (q) => q.eq('stripeEventId', args.event.stripeEventId))
      .unique();

    if (existing) return null;

    const id = await ctx.db.insert('paymentEvents', {
      ...args.event,
      createdAt: new Date().toISOString(),
    });
    return (await ctx.db.get(id))!;
  },
});

export const listPaymentEvents = query({
  args: {
    appId: v.string(),
    limit: v.optional(v.number()),
    eventType: v.optional(v.string()),
    sinceIso: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 10, 5000));
    let rows = args.eventType
      ? await ctx.db
          .query('paymentEvents')
          .withIndex('by_app_event_created', (q) => q.eq('appId', args.appId).eq('eventType', args.eventType!))
          .collect()
      : await ctx.db
          .query('paymentEvents')
          .withIndex('by_app_created', (q) => q.eq('appId', args.appId))
          .collect();

    if (args.sinceIso) {
      const since = new Date(args.sinceIso).getTime();
      rows = rows.filter((r) => new Date(r.createdAt).getTime() >= since);
    }

    return rows
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, limit);
  },
});

export const getReferralCodeByOwner = query({
  args: { appId: v.string(), externalUserId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('referralCodes')
      .withIndex('by_app_external', (q) => q.eq('appId', args.appId).eq('externalUserId', args.externalUserId))
      .unique();
  },
});

export const getOrCreateReferralCode = mutation({
  args: { appId: v.string(), externalUserId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('referralCodes')
      .withIndex('by_app_external', (q) => q.eq('appId', args.appId).eq('externalUserId', args.externalUserId))
      .unique();
    if (existing) return existing;

    const code = `${args.appId.slice(0, 3).toUpperCase()}${args.externalUserId.slice(-6).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const id = await ctx.db.insert('referralCodes', {
      appId: args.appId,
      externalUserId: args.externalUserId,
      code,
      createdAt: new Date().toISOString(),
    });
    return (await ctx.db.get(id))!;
  },
});

export const resolveReferralCode = query({
  args: { appId: v.string(), code: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('referralCodes')
      .withIndex('by_app_code', (q) => q.eq('appId', args.appId).eq('code', args.code.toUpperCase()))
      .unique();
  },
});

export const upsertReferralConversion = mutation({
  args: {
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
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('referralConversions')
      .withIndex('by_app_referred', (q) => q.eq('appId', args.appId).eq('referredExternalUserId', args.referredExternalUserId))
      .unique();

    const now = new Date().toISOString();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: now });
      return;
    }

    await ctx.db.insert('referralConversions', {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const listReferralConversions = query({
  args: { appId: v.string(), referrerExternalUserId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('referralConversions')
      .withIndex('by_app_referrer', (q) => q.eq('appId', args.appId).eq('referrerExternalUserId', args.referrerExternalUserId))
      .collect();
  },
});

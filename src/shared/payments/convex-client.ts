import { AppId, PaymentEvent, ReferralCode, Subscription, SubscriptionTier } from './types';

interface ConvexEnvelope<T> {
  status: 'success' | 'error';
  value?: T;
  errorMessage?: string;
}

interface ConvexSubscriptionDoc {
  _id: string;
  appId: AppId;
  externalUserId: string;
  userId?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  tier: SubscriptionTier;
  status: Subscription['status'];
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  grandfathered?: boolean;
  grandfatheredFromTier?: SubscriptionTier;
  grandfatheredGraceEnd?: string;
  createdAt: string;
  updatedAt: string;
}

interface ConvexPaymentEventDoc {
  _id: string;
  appId: AppId;
  eventType: string;
  stripeEventId: string;
  userId?: string;
  externalUserId?: string;
  amount?: number;
  currency?: string;
  tier?: SubscriptionTier;
  metadata?: Record<string, any>;
  createdAt: string;
}

interface ConvexReferralCodeDoc {
  _id: string;
  appId: AppId;
  externalUserId: string;
  code: string;
  createdAt: string;
}

export interface ConvexPaymentStore {
  getSubscription(appId: AppId, externalUserId: string): Promise<Subscription | null>;
  getSubscriptionByStripeCustomer(stripeCustomerId: string): Promise<Subscription | null>;
  upsertSubscription(appId: AppId, externalUserId: string, updates: Partial<Subscription>): Promise<Subscription>;
  listSubscriptionsByApp(appId: AppId): Promise<Subscription[]>;
  recordPaymentEvent(event: Omit<PaymentEvent, 'id' | 'createdAt'>): Promise<PaymentEvent | null>;
  listPaymentEvents(args: { appId: AppId; limit?: number; eventType?: string; sinceIso?: string }): Promise<PaymentEvent[]>;
  getOrCreateReferralCode(appId: AppId, externalUserId: string): Promise<ReferralCode>;
  getReferralCodeByOwner(appId: AppId, externalUserId: string): Promise<ReferralCode | null>;
  resolveReferralCode(appId: AppId, code: string): Promise<ReferralCode | null>;
  upsertReferralConversion(args: {
    appId: AppId;
    referrerExternalUserId: string;
    referredExternalUserId: string;
    checkoutSessionId?: string;
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    status: 'pending' | 'converted' | 'rejected';
    rewardMonths: number;
    payoutCents: number;
    convertedAt?: string;
    metadata?: Record<string, any>;
  }): Promise<void>;
  listReferralConversions(appId: AppId, referrerExternalUserId: string): Promise<any[]>;
}

class ConvexHttpPaymentStore implements ConvexPaymentStore {
  constructor(private readonly url: string, private readonly adminKey: string) {}

  private async request<T>(kind: 'query' | 'mutation', path: string, args: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${this.url}/api/${kind}`, {
      method: 'POST',
      headers: {
        Authorization: `Convex ${this.adminKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path, args }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Convex ${kind} failed (${response.status}): ${text}`);
    }

    const body = (await response.json()) as ConvexEnvelope<T>;
    if (body.status !== 'success') {
      throw new Error(body.errorMessage || `Convex ${kind} failed for ${path}`);
    }

    return body.value as T;
  }

  async getSubscription(appId: AppId, externalUserId: string): Promise<Subscription | null> {
    const doc = await this.request<ConvexSubscriptionDoc | null>('query', 'payments:getSubscription', { appId, externalUserId });
    return doc ? mapSubscription(doc) : null;
  }

  async getSubscriptionByStripeCustomer(stripeCustomerId: string): Promise<Subscription | null> {
    const doc = await this.request<ConvexSubscriptionDoc | null>('query', 'payments:getSubscriptionByStripeCustomer', { stripeCustomerId });
    return doc ? mapSubscription(doc) : null;
  }

  async upsertSubscription(appId: AppId, externalUserId: string, updates: Partial<Subscription>): Promise<Subscription> {
    const doc = await this.request<ConvexSubscriptionDoc>('mutation', 'payments:upsertSubscription', {
      appId,
      externalUserId,
      updates: serializeSubscriptionUpdate(updates),
    });
    return mapSubscription(doc);
  }

  async listSubscriptionsByApp(appId: AppId): Promise<Subscription[]> {
    const docs = await this.request<ConvexSubscriptionDoc[]>('query', 'payments:listSubscriptionsByApp', { appId });
    return docs.map(mapSubscription);
  }

  async recordPaymentEvent(event: Omit<PaymentEvent, 'id' | 'createdAt'>): Promise<PaymentEvent | null> {
    const doc = await this.request<ConvexPaymentEventDoc | null>('mutation', 'payments:recordPaymentEvent', {
      event: {
        ...event,
        metadata: event.metadata || undefined,
      },
    });
    return doc ? mapPaymentEvent(doc) : null;
  }

  async listPaymentEvents(args: { appId: AppId; limit?: number; eventType?: string; sinceIso?: string }): Promise<PaymentEvent[]> {
    const docs = await this.request<ConvexPaymentEventDoc[]>('query', 'payments:listPaymentEvents', args);
    return docs.map(mapPaymentEvent);
  }

  async getOrCreateReferralCode(appId: AppId, externalUserId: string): Promise<ReferralCode> {
    const doc = await this.request<ConvexReferralCodeDoc>('mutation', 'payments:getOrCreateReferralCode', { appId, externalUserId });
    return mapReferralCode(doc);
  }

  async getReferralCodeByOwner(appId: AppId, externalUserId: string): Promise<ReferralCode | null> {
    const doc = await this.request<ConvexReferralCodeDoc | null>('query', 'payments:getReferralCodeByOwner', { appId, externalUserId });
    return doc ? mapReferralCode(doc) : null;
  }

  async resolveReferralCode(appId: AppId, code: string): Promise<ReferralCode | null> {
    const doc = await this.request<ConvexReferralCodeDoc | null>('query', 'payments:resolveReferralCode', { appId, code });
    return doc ? mapReferralCode(doc) : null;
  }

  async upsertReferralConversion(args: {
    appId: AppId;
    referrerExternalUserId: string;
    referredExternalUserId: string;
    checkoutSessionId?: string;
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    status: 'pending' | 'converted' | 'rejected';
    rewardMonths: number;
    payoutCents: number;
    convertedAt?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    await this.request<null>('mutation', 'payments:upsertReferralConversion', args);
  }

  async listReferralConversions(appId: AppId, referrerExternalUserId: string): Promise<any[]> {
    return this.request<any[]>('query', 'payments:listReferralConversions', { appId, referrerExternalUserId });
  }
}

export function getConvexPaymentStore(): ConvexPaymentStore {
  const url = process.env.CONVEX_URL;
  const adminKey = process.env.CONVEX_ADMIN_KEY;

  if (!url || !adminKey) {
    throw new Error('CONVEX_URL and CONVEX_ADMIN_KEY must be set for payment persistence');
  }

  return new ConvexHttpPaymentStore(url.replace(/\/$/, ''), adminKey);
}

function mapSubscription(doc: ConvexSubscriptionDoc): Subscription {
  return {
    id: doc._id,
    userId: doc.userId,
    appId: doc.appId,
    externalUserId: doc.externalUserId,
    stripeCustomerId: doc.stripeCustomerId,
    stripeSubscriptionId: doc.stripeSubscriptionId,
    tier: doc.tier,
    status: doc.status,
    currentPeriodStart: doc.currentPeriodStart ? new Date(doc.currentPeriodStart) : undefined,
    currentPeriodEnd: doc.currentPeriodEnd ? new Date(doc.currentPeriodEnd) : undefined,
    grandfathered: Boolean(doc.grandfathered),
    grandfatheredFromTier: doc.grandfatheredFromTier,
    grandfatheredGraceEnd: doc.grandfatheredGraceEnd ? new Date(doc.grandfatheredGraceEnd) : undefined,
    createdAt: new Date(doc.createdAt),
    updatedAt: new Date(doc.updatedAt),
  };
}

function serializeSubscriptionUpdate(updates: Partial<Subscription>): Record<string, unknown> {
  const has = (key: keyof Subscription) => Object.prototype.hasOwnProperty.call(updates, key);

  return {
    ...(has('userId') && { userId: updates.userId ?? null }),
    ...(has('stripeCustomerId') && { stripeCustomerId: updates.stripeCustomerId ?? null }),
    ...(has('stripeSubscriptionId') && { stripeSubscriptionId: updates.stripeSubscriptionId ?? null }),
    ...(has('tier') && { tier: updates.tier }),
    ...(has('status') && { status: updates.status }),
    ...(has('currentPeriodStart') && {
      currentPeriodStart: updates.currentPeriodStart ? updates.currentPeriodStart.toISOString() : null,
    }),
    ...(has('currentPeriodEnd') && {
      currentPeriodEnd: updates.currentPeriodEnd ? updates.currentPeriodEnd.toISOString() : null,
    }),
    ...(has('grandfathered') && { grandfathered: updates.grandfathered }),
    ...(has('grandfatheredFromTier') && {
      grandfatheredFromTier: updates.grandfatheredFromTier ?? null,
    }),
    ...(has('grandfatheredGraceEnd') && {
      grandfatheredGraceEnd: updates.grandfatheredGraceEnd ? updates.grandfatheredGraceEnd.toISOString() : null,
    }),
  };
}

function mapPaymentEvent(doc: ConvexPaymentEventDoc): PaymentEvent {
  return {
    id: doc._id,
    appId: doc.appId,
    eventType: doc.eventType,
    stripeEventId: doc.stripeEventId,
    userId: doc.userId,
    externalUserId: doc.externalUserId,
    amount: doc.amount,
    currency: doc.currency,
    tier: doc.tier,
    metadata: doc.metadata,
    createdAt: new Date(doc.createdAt),
  };
}

function mapReferralCode(doc: ConvexReferralCodeDoc): ReferralCode {
  return {
    id: doc._id,
    appId: doc.appId,
    externalUserId: doc.externalUserId,
    code: doc.code,
    createdAt: new Date(doc.createdAt),
  };
}

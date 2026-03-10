"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConvexPaymentStore = getConvexPaymentStore;
class ConvexHttpPaymentStore {
    url;
    adminKey;
    constructor(url, adminKey) {
        this.url = url;
        this.adminKey = adminKey;
    }
    async request(kind, path, args) {
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
        const body = (await response.json());
        if (body.status !== 'success') {
            throw new Error(body.errorMessage || `Convex ${kind} failed for ${path}`);
        }
        return body.value;
    }
    async getSubscription(appId, externalUserId) {
        const doc = await this.request('query', 'payments:getSubscription', { appId, externalUserId });
        return doc ? mapSubscription(doc) : null;
    }
    async getSubscriptionByStripeCustomer(stripeCustomerId) {
        const doc = await this.request('query', 'payments:getSubscriptionByStripeCustomer', { stripeCustomerId });
        return doc ? mapSubscription(doc) : null;
    }
    async upsertSubscription(appId, externalUserId, updates) {
        const doc = await this.request('mutation', 'payments:upsertSubscription', {
            appId,
            externalUserId,
            updates: serializeSubscriptionUpdate(updates),
        });
        return mapSubscription(doc);
    }
    async listSubscriptionsByApp(appId) {
        const docs = await this.request('query', 'payments:listSubscriptionsByApp', { appId });
        return docs.map(mapSubscription);
    }
    async recordPaymentEvent(event) {
        const doc = await this.request('mutation', 'payments:recordPaymentEvent', {
            event: {
                ...event,
                metadata: event.metadata || undefined,
            },
        });
        return doc ? mapPaymentEvent(doc) : null;
    }
    async listPaymentEvents(args) {
        const docs = await this.request('query', 'payments:listPaymentEvents', args);
        return docs.map(mapPaymentEvent);
    }
    async getOrCreateReferralCode(appId, externalUserId) {
        const doc = await this.request('mutation', 'payments:getOrCreateReferralCode', { appId, externalUserId });
        return mapReferralCode(doc);
    }
    async getReferralCodeByOwner(appId, externalUserId) {
        const doc = await this.request('query', 'payments:getReferralCodeByOwner', { appId, externalUserId });
        return doc ? mapReferralCode(doc) : null;
    }
    async resolveReferralCode(appId, code) {
        const doc = await this.request('query', 'payments:resolveReferralCode', { appId, code });
        return doc ? mapReferralCode(doc) : null;
    }
    async upsertReferralConversion(args) {
        await this.request('mutation', 'payments:upsertReferralConversion', args);
    }
    async listReferralConversions(appId, referrerExternalUserId) {
        return this.request('query', 'payments:listReferralConversions', { appId, referrerExternalUserId });
    }
}
function getConvexPaymentStore() {
    const url = process.env.CONVEX_URL;
    const adminKey = process.env.CONVEX_ADMIN_KEY;
    if (!url || !adminKey) {
        throw new Error('CONVEX_URL and CONVEX_ADMIN_KEY must be set for payment persistence');
    }
    return new ConvexHttpPaymentStore(url.replace(/\/$/, ''), adminKey);
}
function mapSubscription(doc) {
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
function serializeSubscriptionUpdate(updates) {
    const has = (key) => Object.prototype.hasOwnProperty.call(updates, key);
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
function mapPaymentEvent(doc) {
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
function mapReferralCode(doc) {
    return {
        id: doc._id,
        appId: doc.appId,
        externalUserId: doc.externalUserId,
        code: doc.code,
        createdAt: new Date(doc.createdAt),
    };
}
//# sourceMappingURL=convex-client.js.map
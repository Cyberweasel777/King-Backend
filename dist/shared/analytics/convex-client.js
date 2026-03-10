"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOptionalConvexAnalyticsStore = getOptionalConvexAnalyticsStore;
exports.getConvexAnalyticsStore = getConvexAnalyticsStore;
class ConvexHttpAnalyticsStore {
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
    async logRequest(request) {
        await this.request('mutation', 'analytics:logRequest', request);
    }
    async getAnalytics(args = {}) {
        return this.request('query', 'analytics:getAnalytics', args);
    }
    async getWalletCRM(args = {}) {
        return this.request('query', 'analytics:getWalletCRM', args);
    }
}
let cachedStore;
function getOptionalConvexAnalyticsStore() {
    if (cachedStore !== undefined) {
        return cachedStore;
    }
    const url = process.env.CONVEX_URL;
    const adminKey = process.env.CONVEX_ADMIN_KEY;
    if (!url || !adminKey) {
        cachedStore = null;
        return cachedStore;
    }
    cachedStore = new ConvexHttpAnalyticsStore(url.replace(/\/$/, ''), adminKey);
    return cachedStore;
}
function getConvexAnalyticsStore() {
    const store = getOptionalConvexAnalyticsStore();
    if (!store) {
        throw new Error('CONVEX_URL and CONVEX_ADMIN_KEY must be set for analytics persistence');
    }
    return store;
}
//# sourceMappingURL=convex-client.js.map
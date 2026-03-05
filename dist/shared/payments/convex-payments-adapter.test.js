"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
process.env.CONVEX_URL = 'https://convex.test';
process.env.CONVEX_ADMIN_KEY = 'test-key';
const db = {
    subscriptions: [],
};
globalThis.fetch = async (_url, init) => {
    const route = _url.includes('/api/mutation') ? 'mutation' : 'query';
    const body = JSON.parse(init?.body || '{}');
    const { path, args } = body;
    if (route === 'query' && path === 'payments:getSubscription') {
        const row = db.subscriptions.find((s) => s.appId === args.appId && s.externalUserId === args.externalUserId) || null;
        return ok(row);
    }
    if (route === 'mutation' && path === 'payments:upsertSubscription') {
        const now = new Date().toISOString();
        let row = db.subscriptions.find((s) => s.appId === args.appId && s.externalUserId === args.externalUserId);
        if (!row) {
            row = {
                _id: `sub_${db.subscriptions.length + 1}`,
                appId: args.appId,
                externalUserId: args.externalUserId,
                tier: 'free',
                status: 'inactive',
                createdAt: now,
                updatedAt: now,
            };
            db.subscriptions.push(row);
        }
        Object.assign(row, args.updates || {}, { updatedAt: now });
        return ok(row);
    }
    if (route === 'query' && path === 'payments:getSubscriptionByStripeCustomer') {
        const row = db.subscriptions.find((s) => s.stripeCustomerId === args.stripeCustomerId) || null;
        return ok(row);
    }
    throw new Error(`Unhandled fetch route: ${route} ${path}`);
};
function ok(value) {
    return {
        ok: true,
        async json() {
            return { status: 'success', value };
        },
    };
}
(async () => {
    const database = await Promise.resolve().then(() => __importStar(require('./database')));
    const accessControl = await Promise.resolve().then(() => __importStar(require('./access-control')));
    const user = 'u_123';
    const created = await database.getOrCreateSubscription('arbwatch', user);
    assert_1.default.equal(created.tier, 'free');
    assert_1.default.equal(created.status, 'inactive');
    const legacyActive = await database.upsertSubscription('arbwatch', user, {
        tier: 'basic',
        status: 'active',
    });
    assert_1.default.equal(legacyActive.tier, 'basic');
    const grandfathered = await database.getSubscription('arbwatch', user);
    assert_1.default.equal(grandfathered?.grandfathered, true);
    assert_1.default.equal(grandfathered?.grandfatheredFromTier, 'basic');
    assert_1.default.ok(grandfathered?.grandfatheredGraceEnd instanceof Date);
    await database.upsertSubscription('arbwatch', user, {
        tier: 'basic',
        status: 'active',
        grandfathered: true,
        grandfatheredFromTier: 'basic',
        grandfatheredGraceEnd: new Date('2024-01-01T00:00:00.000Z'),
    });
    const allowedStarter = await accessControl.isSubscribed('arbwatch', user, 'starter');
    assert_1.default.equal(allowedStarter, true);
    const migrated = await database.getSubscription('arbwatch', user);
    assert_1.default.equal(migrated?.tier, 'starter');
    assert_1.default.equal(migrated?.grandfathered, false);
    assert_1.default.equal(migrated?.grandfatheredFromTier, undefined);
    console.log('convex-payments-adapter.test.ts passed');
})();
//# sourceMappingURL=convex-payments-adapter.test.js.map
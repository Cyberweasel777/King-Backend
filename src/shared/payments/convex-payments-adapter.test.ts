import assert from 'assert';

process.env.CONVEX_URL = 'https://convex.test';
process.env.CONVEX_ADMIN_KEY = 'test-key';

type Doc = Record<string, any> & { _id: string };

const db = {
  subscriptions: [] as Doc[],
};

(globalThis as any).fetch = async (_url: string, init?: any) => {
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

function ok(value: any) {
  return {
    ok: true,
    async json() {
      return { status: 'success', value };
    },
  } as any;
}

(async () => {
  const database = await import('./database');
  const accessControl = await import('./access-control');

  const user = 'u_123';

  const created = await database.getOrCreateSubscription('arbwatch', user);
  assert.equal(created.tier, 'free');
  assert.equal(created.status, 'inactive');

  const legacyActive = await database.upsertSubscription('arbwatch', user, {
    tier: 'basic',
    status: 'active',
  });
  assert.equal(legacyActive.tier, 'basic');

  const grandfathered = await database.getSubscription('arbwatch', user);
  assert.equal(grandfathered?.grandfathered, true);
  assert.equal(grandfathered?.grandfatheredFromTier, 'basic');
  assert.ok(grandfathered?.grandfatheredGraceEnd instanceof Date);

  await database.upsertSubscription('arbwatch', user, {
    tier: 'basic',
    status: 'active',
    grandfathered: true,
    grandfatheredFromTier: 'basic',
    grandfatheredGraceEnd: new Date('2024-01-01T00:00:00.000Z'),
  });

  const allowedStarter = await accessControl.isSubscribed('arbwatch', user, 'starter');
  assert.equal(allowedStarter, true);

  const migrated = await database.getSubscription('arbwatch', user);
  assert.equal(migrated?.tier, 'starter');
  assert.equal(migrated?.grandfathered, false);
  assert.equal(migrated?.grandfatheredFromTier, undefined);

  console.log('convex-payments-adapter.test.ts passed');
})();

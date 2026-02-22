import assert from 'assert';
import { getEffectiveSubscription, mapLegacyTierToV2Tier } from './arbwatch-migration';
import type { Subscription } from './types';

function sub(partial: Partial<Subscription>): Subscription {
  const now = new Date('2026-02-22T00:00:00.000Z');
  return {
    id: 'sub_1',
    appId: 'arbwatch',
    externalUserId: '123',
    tier: 'basic',
    status: 'active',
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

(() => {
  assert.equal(mapLegacyTierToV2Tier('basic'), 'starter');
  assert.equal(mapLegacyTierToV2Tier('pro'), 'pro');
  assert.equal(mapLegacyTierToV2Tier('elite'), 'elite');

  const now = new Date('2026-02-22T00:00:00.000Z');
  const inGrace = getEffectiveSubscription(
    sub({
      tier: 'basic',
      grandfathered: true,
      grandfatheredFromTier: 'basic',
      grandfatheredGraceEnd: new Date('2026-03-10T00:00:00.000Z'),
    }),
    now,
  );
  assert.equal(inGrace.effectiveTier, 'pro');
  assert.equal(inGrace.inGrandfatherGrace, true);
  assert.equal(inGrace.shouldAutoMigrate, false);

  const postGrace = getEffectiveSubscription(
    sub({
      tier: 'basic',
      grandfathered: true,
      grandfatheredFromTier: 'basic',
      grandfatheredGraceEnd: new Date('2026-01-10T00:00:00.000Z'),
    }),
    now,
  );
  assert.equal(postGrace.effectiveTier, 'starter');
  assert.equal(postGrace.inGrandfatherGrace, false);
  assert.equal(postGrace.shouldAutoMigrate, true);

  const modernTier = getEffectiveSubscription(
    sub({ tier: 'elite', grandfathered: false }),
    now,
  );
  assert.equal(modernTier.effectiveTier, 'elite');
  assert.equal(modernTier.shouldAutoMigrate, false);

  console.log('arbwatch-migration.test.ts passed');
})();

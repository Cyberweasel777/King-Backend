"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const arbwatch_migration_1 = require("./arbwatch-migration");
function sub(partial) {
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
    assert_1.default.equal((0, arbwatch_migration_1.mapLegacyTierToV2Tier)('basic'), 'starter');
    assert_1.default.equal((0, arbwatch_migration_1.mapLegacyTierToV2Tier)('pro'), 'pro');
    assert_1.default.equal((0, arbwatch_migration_1.mapLegacyTierToV2Tier)('elite'), 'elite');
    const now = new Date('2026-02-22T00:00:00.000Z');
    const inGrace = (0, arbwatch_migration_1.getEffectiveSubscription)(sub({
        tier: 'basic',
        grandfathered: true,
        grandfatheredFromTier: 'basic',
        grandfatheredGraceEnd: new Date('2026-03-10T00:00:00.000Z'),
    }), now);
    assert_1.default.equal(inGrace.effectiveTier, 'pro');
    assert_1.default.equal(inGrace.inGrandfatherGrace, true);
    assert_1.default.equal(inGrace.shouldAutoMigrate, false);
    const postGrace = (0, arbwatch_migration_1.getEffectiveSubscription)(sub({
        tier: 'basic',
        grandfathered: true,
        grandfatheredFromTier: 'basic',
        grandfatheredGraceEnd: new Date('2026-01-10T00:00:00.000Z'),
    }), now);
    assert_1.default.equal(postGrace.effectiveTier, 'starter');
    assert_1.default.equal(postGrace.inGrandfatherGrace, false);
    assert_1.default.equal(postGrace.shouldAutoMigrate, true);
    const modernTier = (0, arbwatch_migration_1.getEffectiveSubscription)(sub({ tier: 'elite', grandfathered: false }), now);
    assert_1.default.equal(modernTier.effectiveTier, 'elite');
    assert_1.default.equal(modernTier.shouldAutoMigrate, false);
    console.log('arbwatch-migration.test.ts passed');
})();
//# sourceMappingURL=arbwatch-migration.test.js.map
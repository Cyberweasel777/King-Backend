-- ArbWatch v2 pricing/grandfather migration support

BEGIN;

ALTER TABLE IF EXISTS subscriptions
  ADD COLUMN IF NOT EXISTS grandfathered boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS grandfathered_from_tier text,
  ADD COLUMN IF NOT EXISTS grandfathered_grace_end timestamptz;

CREATE INDEX IF NOT EXISTS idx_subscriptions_arbwatch_grace
  ON subscriptions (app_id, grandfathered, grandfathered_grace_end)
  WHERE app_id = 'arbwatch';

COMMIT;

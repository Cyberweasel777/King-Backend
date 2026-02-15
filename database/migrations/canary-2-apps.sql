-- Canary Migration: 2 Apps Only
-- SpreadHunter + MemeRadar
-- Safe first step before porting all 15

BEGIN;

-- ============================================
-- SPREADHUNTER
-- ============================================

ALTER TABLE IF EXISTS opportunities RENAME TO spreadhunter_opportunities;
ALTER TABLE IF EXISTS tracked_items RENAME TO spreadhunter_tracked_items;
ALTER TABLE IF EXISTS price_history RENAME TO spreadhunter_price_history;
ALTER TABLE IF EXISTS arbitrage_alerts RENAME TO spreadhunter_alerts;

-- Indexes for SpreadHunter
CREATE INDEX IF NOT EXISTS idx_sh_opps_status ON spreadhunter_opportunities(status);
CREATE INDEX IF NOT EXISTS idx_sh_opps_created ON spreadhunter_opportunities(created_at DESC);

-- ============================================
-- MEMERADAR
-- ============================================

ALTER TABLE IF EXISTS tokens RENAME TO memeradar_tokens;
ALTER TABLE IF EXISTS token_prices RENAME TO memeradar_prices;
ALTER TABLE IF EXISTS whale_transactions RENAME TO memeradar_whales;
ALTER TABLE IF EXISTS token_alerts RENAME TO memeradar_alerts;

-- Indexes for MemeRadar
CREATE INDEX IF NOT EXISTS idx_mr_tokens_symbol ON memeradar_tokens(symbol);
CREATE INDEX IF NOT EXISTS idx_mr_tokens_chain ON memeradar_tokens(chain);
CREATE INDEX IF NOT EXISTS idx_mr_prices_time ON memeradar_prices(token_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_mr_whales_time ON memeradar_whales(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mr_alerts_user ON memeradar_alerts(user_id);

-- ============================================
-- SHARED TABLES (Keep as-is)
-- ============================================

-- users
-- subscriptions
-- api_keys
-- audit_logs

COMMIT;

-- Verify
SELECT 'SpreadHunter tables:' as info;
SELECT table_name FROM information_schema.tables 
WHERE table_name LIKE 'spreadhunter_%' ORDER BY table_name;

SELECT 'MemeRadar tables:' as info;
SELECT table_name FROM information_schema.tables 
WHERE table_name LIKE 'memeradar_%' ORDER BY table_name;

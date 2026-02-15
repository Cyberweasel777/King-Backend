-- King Backend Database Migration
-- Big Bang: Migrate all 15 apps with prefixed table names
-- Run this in Supabase SQL Editor

-- Start transaction
BEGIN;

-- ============================================
-- 1. ORIGINAL 8 APPS
-- ============================================

-- SpreadHunter
ALTER TABLE IF EXISTS opportunities RENAME TO spreadhunter_opportunities;
ALTER TABLE IF EXISTS tracked_items RENAME TO spreadhunter_tracked_items;
ALTER TABLE IF EXISTS price_history RENAME TO spreadhunter_price_history;
ALTER TABLE IF EXISTS arbitrage_alerts RENAME TO spreadhunter_arbitrage_alerts;

-- DeckVault
ALTER TABLE IF EXISTS collections RENAME TO deckvault_collections;
ALTER TABLE IF EXISTS cards RENAME TO deckvault_cards;
ALTER TABLE IF EXISTS card_prices RENAME TO deckvault_card_prices;
ALTER TABLE IF EXISTS ocr_scans RENAME TO deckvault_ocr_scans;

-- PackPal
ALTER TABLE IF EXISTS packs RENAME TO packpal_packs;
ALTER TABLE IF EXISTS pack_evs RENAME TO packpal_evs;
ALTER TABLE IF EXISTS set_data RENAME TO packpal_sets;

-- DropScout
ALTER TABLE IF EXISTS sneaker_drops RENAME TO dropscout_drops;
ALTER TABLE IF EXISTS monitors RENAME TO dropscout_monitors;
ALTER TABLE IF EXISTS drop_alerts RENAME TO dropscout_alerts;

-- SkinSignal
ALTER TABLE IF EXISTS skin_items RENAME TO skinsignal_items;
ALTER TABLE IF EXISTS skin_prices RENAME TO skinsignal_prices;
ALTER TABLE IF EXISTS arbitrage_ops RENAME TO skinsignal_arbitrage;

-- MemeRadar
ALTER TABLE IF EXISTS tokens RENAME TO memeradar_tokens;
ALTER TABLE IF EXISTS token_prices RENAME TO memeradar_prices;
ALTER TABLE IF EXISTS whale_transactions RENAME TO memeradar_whales;
ALTER TABLE IF EXISTS token_alerts RENAME TO memeradar_alerts;

-- RosterRadar
ALTER TABLE IF EXISTS odds_data RENAME TO rosterradar_odds;
ALTER TABLE IF EXISTS events RENAME TO rosterradar_events;
ALTER TABLE IF EXISTS betting_lines RENAME TO rosterradar_lines;

-- ArbWatch
ALTER TABLE IF EXISTS prediction_markets RENAME TO arbwatch_markets;
ALTER TABLE IF EXISTS market_positions RENAME TO arbwatch_positions;
ALTER TABLE IF EXISTS arbitrage_scans RENAME TO arbwatch_scans;

-- ============================================
-- 2. PHASE 1 APPS (3)
-- ============================================

-- NFTPulse
ALTER TABLE IF EXISTS nft_collections RENAME TO nftpulse_collections;
ALTER TABLE IF EXISTS nft_listings RENAME TO nftpulse_listings;
ALTER TABLE IF EXISTS floor_prices RENAME TO nftpulse_floors;

-- DropFarm
ALTER TABLE IF EXISTS airdrops RENAME TO dropfarm_airdrops;
ALTER TABLE IF EXISTS farm_positions RENAME TO dropfarm_positions;
ALTER TABLE IF EXISTS eligibility_checks RENAME TO dropfarm_eligibility;

-- LaunchRadar
ALTER TABLE IF EXISTS presales RENAME TO launchradar_presales;
ALTER TABLE IF EXISTS vetting_reports RENAME TO launchradar_vetting;
ALTER TABLE IF EXISTS launch_alerts RENAME TO launchradar_alerts;

-- ============================================
-- 3. PHASE 2 APPS (3)
-- ============================================

-- SocialIndex
ALTER TABLE IF EXISTS social_tokens RENAME TO socialindex_tokens;
ALTER TABLE IF EXISTS creator_metrics RENAME TO socialindex_metrics;
ALTER TABLE IF EXISTS token_correlations RENAME TO socialindex_correlations;

-- MemeStock
ALTER TABLE IF EXISTS meme_stocks RENAME TO memestock_stocks;
ALTER TABLE IF EXISTS stock_sentiment RENAME TO memestock_sentiment;
ALTER TABLE IF EXISTS short_interest RENAME TO memestock_shorts;

-- PointTrack
ALTER TABLE IF EXISTS point_programs RENAME TO pointtrack_programs;
ALTER TABLE IF EXISTS point_positions RENAME TO pointtrack_positions;
ALTER TABLE IF EXISTS multiplier_events RENAME TO pointtrack_multipliers;

-- ============================================
-- 4. BOTINDEX (Just Built)
-- ============================================

-- BotIndex tables already have prefix from build
-- ALTER TABLE IF EXISTS ai_agents RENAME TO botindex_agents;
-- ALTER TABLE IF EXISTS agent_metrics RENAME TO botindex_metrics;
-- ALTER TABLE IF EXISTS correlations RENAME TO botindex_correlations;
-- ALTER TABLE IF EXISTS token_launches RENAME TO botindex_launches;
-- ALTER TABLE IF EXISTS signals RENAME TO botindex_signals;
-- ALTER TABLE IF EXISTS subscriptions RENAME TO botindex_subscriptions;

-- ============================================
-- 5. SHARED TABLES (Keep as-is)
-- ============================================

-- These tables stay without prefix (shared across apps)
-- users
-- subscriptions  
-- api_keys
-- audit_logs

-- ============================================
-- 6. CREATE INDEXES FOR PERFORMANCE
-- ============================================

-- MemeRadar indexes
CREATE INDEX IF NOT EXISTS idx_memeradar_tokens_symbol ON memeradar_tokens(symbol);
CREATE INDEX IF NOT EXISTS idx_memeradar_prices_time ON memeradar_prices(token_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_memeradar_whales_time ON memeradar_whales(created_at DESC);

-- BotIndex indexes  
CREATE INDEX IF NOT EXISTS idx_botindex_agents_platform ON botindex_agents(platform);
CREATE INDEX IF NOT EXISTS idx_botindex_correlations_pair ON botindex_correlations(token_a, token_b);

-- SpreadHunter indexes
CREATE INDEX IF NOT EXISTS idx_spreadhunter_opps_status ON spreadhunter_opportunities(status);

-- Add more indexes as needed per app

-- ============================================
-- 7. VERIFY MIGRATION
-- ============================================

-- Check all tables exist with new names
DO $$
DECLARE
    app_tables TEXT[] := ARRAY[
        'spreadhunter_opportunities', 'deckvault_collections', 'packpal_packs',
        'dropscout_drops', 'skinsignal_items', 'memeradar_tokens',
        'rosterradar_odds', 'arbwatch_markets', 'nftpulse_collections',
        'dropfarm_airdrops', 'launchradar_presales', 'socialindex_tokens',
        'memestock_stocks', 'pointtrack_programs', 'botindex_agents'
    ];
    tbl TEXT;
    missing_count INT := 0;
BEGIN
    FOREACH tbl IN ARRAY app_tables
    LOOP
        IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = tbl) THEN
            RAISE NOTICE 'Missing table: %', tbl;
            missing_count := missing_count + 1;
        END IF;
    END LOOP;
    
    IF missing_count > 0 THEN
        RAISE WARNING 'Migration incomplete: % tables missing', missing_count;
    ELSE
        RAISE NOTICE 'All app tables migrated successfully';
    END IF;
END $$;

-- Commit transaction
COMMIT;

-- Verify: List all tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE '%_%'
ORDER BY table_name;

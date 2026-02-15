# Migration Guide: From 15 Apps to King Backend

## Overview

This guide walks through migrating from 15 separate app deployments to the unified King Backend architecture.

## Pre-Migration Checklist

- [ ] Audit all 15 apps for active users
- [ ] Document current API endpoints for each app
- [ ] Export all database schemas
- [ ] List all environment variables
- [ ] Identify custom integrations/webhooks

---

## Phase 1: Preparation (Day 1)

### 1.1 Database Migration

```bash
# Connect to your Supabase instance
psql $SUPABASE_URL

# Run migration script for each app
-- SpreadHunter
ALTER TABLE IF EXISTS opportunities RENAME TO spreadhunter_opportunities;
ALTER TABLE IF EXISTS alerts RENAME TO spreadhunter_alerts;
ALTER TABLE IF EXISTS tracked_items RENAME TO spreadhunter_tracked_items;

-- DeckVault
ALTER TABLE IF EXISTS collections RENAME TO deckvault_collections;
ALTER TABLE IF EXISTS cards RENAME TO deckvault_cards;
ALTER TABLE IF EXISTS scans RENAME TO deckvault_scans;

-- PackPal
ALTER TABLE IF EXISTS packs RENAME TO packpal_packs;
ALTER TABLE IF EXISTS ev_calculations RENAME TO packpal_ev_calculations;

-- DropScout
ALTER TABLE IF EXISTS drops RENAME TO dropscout_drops;
ALTER TABLE IF EXISTS monitors RENAME TO dropscout_monitors;

-- SkinSignal
ALTER TABLE IF EXISTS items RENAME TO skinsignal_items;
ALTER TABLE IF EXISTS prices RENAME TO skinsignal_prices;
ALTER TABLE IF EXISTS arbitrages RENAME TO skinsignal_arbitrages;

-- MemeRadar
ALTER TABLE IF EXISTS tokens RENAME TO memeradar_tokens;
ALTER TABLE IF EXISTS whales RENAME TO memeradar_whales;
ALTER TABLE IF EXISTS transactions RENAME TO memeradar_transactions;

-- RosterRadar
ALTER TABLE IF EXISTS odds RENAME TO rosterradar_odds;
ALTER TABLE IF EXISTS lines RENAME TO rosterradar_lines;

-- ArbWatch
ALTER TABLE IF EXISTS markets RENAME TO arbwatch_markets;
ALTER TABLE IF EXISTS positions RENAME TO arbwatch_positions;

-- NFTPulse
ALTER TABLE IF EXISTS nfts RENAME TO nftpulse_nfts;
ALTER TABLE IF EXISTS collections RENAME TO nftpulse_collections;

-- DropFarm
ALTER TABLE IF EXISTS airdrops RENAME TO dropfarm_airdrops;
ALTER TABLE IF EXISTS farms RENAME TO dropfarm_farms;

-- LaunchRadar
ALTER TABLE IF EXISTS presales RENAME TO launchradar_presales;
ALTER TABLE IF EXISTS vetting_results RENAME TO launchradar_vetting_results;

-- SocialIndex
ALTER TABLE IF EXISTS social_tokens RENAME TO socialindex_tokens;
ALTER TABLE IF EXISTS key_holders RENAME TO socialindex_key_holders;

-- MemeStock
ALTER TABLE IF EXISTS stocks RENAME TO memestock_stocks;
ALTER TABLE IF EXISTS sentiment RENAME TO memestock_sentiment;

-- PointTrack
ALTER TABLE IF EXISTS programs RENAME TO pointtrack_programs;
ALTER TABLE IF EXISTS positions RENAME TO pointtrack_positions;

-- BotIndex
ALTER TABLE IF EXISTS agents RENAME TO botindex_agents;
ALTER TABLE IF EXISTS signals RENAME TO botindex_signals;
```

### 1.2 Environment Variable Consolidation

Create `.env` file with all tokens:

```bash
# Copy from each app's .env
# 15 bot tokens
SPREADHUNTER_BOT_TOKEN=xxx
DECKVAULT_BOT_TOKEN=xxx
# ... etc for all 15 apps

# Consolidate into single Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=xxx
SUPABASE_ANON_KEY=xxx

# Single Redis instance
REDIS_URL=redis://default:xxx@fly-king-redis.upstash.io:6379
```

---

## Phase 2: Code Migration (Days 2-3)

### 2.1 API Routes Migration

For each app, create route file:

```bash
# Example: Migrating MemeRadar
cat > king-backend/src/api/routes/memeradar.ts << 'EOF'
import { Router } from 'express';

const router = Router();

// Copy existing endpoints from old app
router.get('/tokens', async (req, res) => {
  // Import your existing controller logic
  const tokens = await getTokensFromDB();
  res.json(tokens);
});

router.get('/tokens/:id', async (req, res) => {
  const token = await getTokenById(req.params.id);
  res.json(token);
});

router.get('/whales', async (req, res) => {
  const whales = await getWhales();
  res.json(whales);
});

router.post('/alerts', requireAuth, async (req, res) => {
  const alert = await createAlert(req.user.id, req.body);
  res.json(alert);
});

export default router;
EOF
```

### 2.2 Bot Handler Migration

```bash
# Example: Telegram bot handler
cat > king-backend/src/bots/telegram/handlers/memeradar.ts << 'EOF'
import { Telegraf } from 'telegraf';

export function registerHandlers(bot: Telegraf) {
  // Copy your existing command handlers
  bot.command('trending', async (ctx) => {
    const trending = await getTrendingTokens();
    await ctx.reply(formatTrending(trending));
  });

  bot.command('whale', async (ctx) => {
    const whales = await getRecentWhales();
    await ctx.reply(formatWhales(whales));
  });

  bot.command('track', async (ctx) => {
    const symbol = ctx.message.text.split(' ')[1];
    if (!symbol) {
      return ctx.reply('Usage: /track <TOKEN_SYMBOL>');
    }
    await trackToken(ctx.from.id, symbol);
    await ctx.reply(`✅ Now tracking ${symbol}`);
  });
}
EOF
```

### 2.3 Pipeline Migration

```bash
# Example: Pipeline engine
cat > king-backend/src/pipeline/engines/memeradar/index.ts << 'EOF'
import { getDbPrefix } from '../../../config/apps';

const TABLE_PREFIX = getDbPrefix('memeradar');

export async function runPipeline() {
  console.log('Running MemeRadar pipeline...');
  
  // Fetch data
  const dexData = await fetchDexScreenerData();
  const whaleData = await fetchWhaleTransactions();
  
  // Process
  const opportunities = analyzeData(dexData, whaleData);
  
  // Store
  await storeOpportunities(opportunities);
  
  // Queue alerts
  await queueSignificantAlerts(opportunities);
}

async function fetchDexScreenerData() {
  // Your existing fetch logic
}

async function fetchWhaleTransactions() {
  // Your existing fetch logic
}
EOF
```

---

## Phase 3: Testing (Day 4)

### 3.1 Local Testing

```bash
cd king-backend

# Install dependencies
npm install

# Start all process groups (in separate terminals)
npm run dev:api      # Terminal 1
npm run dev:bots     # Terminal 2
npm run dev:pipeline # Terminal 3
npm run dev:worker   # Terminal 4
```

### 3.2 API Testing

```bash
# Test health endpoint
curl http://localhost:8080/health

# Test app routes
curl http://localhost:8080/api/memeradar/tokens
curl http://localhost:8080/api/botindex/agents

# Test bot (send message to your Telegram bot)
```

### 3.3 Validate Database

```sql
-- Check all tables have correct prefix
SELECT tablename FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename LIKE '%_%';

-- Should show: spreadhunter_*, memeradar_*, etc.
```

---

## Phase 4: Deployment (Day 5)

### 4.1 Create Fly.io App

```bash
cd king-backend

# Create app
fly apps create king-backend

# Set all secrets
fly secrets set SUPABASE_URL="xxx" \
  SUPABASE_SERVICE_KEY="xxx" \
  REDIS_URL="xxx" \
  SPREADHUNTER_BOT_TOKEN="xxx" \
  MEMERADAR_BOT_TOKEN="xxx" \
  # ... all other tokens

# Deploy
fly deploy
```

### 4.2 Verify Deployment

```bash
# Check process groups
fly status

# View logs
fly logs

# Check specific process
fly status --process-group api
fly status --process-group bots
```

### 4.3 Scale Process Groups

```bash
# API: Scale based on traffic
fly scale count api=2 --process-group api

# Bots: Keep at 1 (stateful)
fly scale count bots=1 --process-group bots

# Worker: Scale based on queue depth
fly scale count worker=2 --process-group worker

# Pipeline: Can run multiple for parallel processing
fly scale count pipeline=1 --process-group pipeline
```

---

## Phase 5: Cutover (Day 6)

### 5.1 DNS/URL Updates

Update your DNS to point to the new Fly.io app:

```
# Old: memeradar-api.fly.dev
# New: king-backend.fly.dev/api/memeradar

# Update your frontend configs
# Update your bot webhook URLs (if using webhooks)
# Update any third-party integrations
```

### 5.2 Monitor & Rollback Plan

Monitor for 24-48 hours:

```bash
# Watch logs
fly logs --follow

# Check error rates
fly metrics

# Database performance
# Check Supabase dashboard
```

**Rollback Plan:**
- Keep old apps deployed but scaled to 0
- If issues arise, update DNS back to old URLs
- Scale up old apps: `fly scale count 1 --app old-app-name`

---

## Migration Checklist by App

| App | DB Migrated | Routes Migrated | Bot Migrated | Pipeline Migrated | Tested |
|-----|-------------|-----------------|--------------|-------------------|--------|
| SpreadHunter | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| DeckVault | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| PackPal | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| DropScout | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| SkinSignal | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| MemeRadar | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| RosterRadar | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| ArbWatch | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| NFTPulse | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| DropFarm | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| LaunchRadar | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| SocialIndex | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| MemeStock | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| PointTrack | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| BotIndex | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |

---

## Troubleshooting

### Bot Not Responding

```bash
# Check bot token
fly logs --process-group bots | grep ERROR

# Verify token is set
fly secrets list | grep BOT_TOKEN
```

### Database Connection Issues

```bash
# Test connection
fly ssh console
node -e "require('./dist/config/database').default.then(c => console.log('OK'))"
```

### Pipeline Not Running

```bash
# Check scheduler logs
fly logs --process-group pipeline

# Verify cron syntax in apps.ts
```

### Queue Jobs Not Processing

```bash
# Check Redis connection
fly ssh console
node -e "require('./dist/config/redis').default.ping().then(r => console.log(r))"

# Check worker logs
fly logs --process-group worker
```

---

## Post-Migration

### Cleanup Old Resources

After 1 week of stable operation:

```bash
# Delete old Fly.io apps
fly apps destroy old-memeradar-app
fly apps destroy old-deckvault-app
# ... etc

# Delete old Supabase projects (if not shared)
# Through Supabase dashboard
```

### Cost Verification

```
Expected savings: ~80%
Before: ~$300-500/month (15 separate apps)
After: ~$50-100/month (unified King Backend)
```

---

## Questions?

Refer to `KING_BACKEND_ARCHITECTURE.md` for full architecture details.

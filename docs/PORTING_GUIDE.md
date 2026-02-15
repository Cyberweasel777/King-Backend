# Big Bang Porting Guide

## Overview

This guide walks you through porting all 15 apps into the King Backend.

## Step 1: Environment Setup (15 min)

```bash
cd king-backend
./scripts/setup-env.sh
```

Fill in all API keys from your existing 15 apps:
- All 15 Telegram bot tokens
- 3 Discord bot tokens
- Supabase credentials
- External API keys (Moltbook, Bitquery, Moralis)

## Step 2: Database Migration (10 min)

**BACKUP FIRST:**
```bash
# Export existing data
pg_dump $SUPABASE_URL > backup-$(date +%Y%m%d).sql
```

**Run migration:**
```bash
psql $SUPABASE_URL -f database/migrations/big-bang-migration.sql
```

**Verify:**
```sql
-- Should see 40+ tables with app prefixes
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' ORDER BY table_name;
```

## Step 3: Port App Logic (2-3 hours)

### For Each App (15 total):

**1. API Routes**
```typescript
// king-backend/src/api/routes/{app}.ts
import { Router } from 'express';
import { getAppLogger } from '../../utils/logger';

const router = Router();
const logger = getAppLogger('memeradar');

// Copy your existing route handlers here
router.get('/tokens', async (req, res) => {
  // Your existing logic
  const tokens = await db.query('SELECT * FROM memeradar_tokens');
  res.json(tokens);
});

export default router;
```

**2. Telegram Bot Commands**
```typescript
// king-backend/src/bots/telegram/handlers/{app}.ts
import { Telegraf } from 'telegraf';
import { getAppLogger } from '../../../utils/logger';

export function createMemeRadarBot(token: string) {
  const bot = new Telegraf(token);
  const logger = getAppLogger('memeradar-bot');
  
  // Copy your existing command handlers
  bot.command('start', (ctx) => {
    ctx.reply('MemeRadar ready! 🦞');
  });
  
  bot.command('trending', async (ctx) => {
    // Your existing trending logic
    const trending = await getTrendingTokens();
    ctx.reply(formatTrending(trending));
  });
  
  return bot;
}
```

**3. Pipeline Scrapers**
```typescript
// king-backend/src/pipeline/engines/{app}/index.ts
import { getAppLogger } from '../../../utils/logger';

const logger = getAppLogger('memeradar-pipeline');

export async function runMemeRadarPipeline() {
  logger.info('Starting MemeRadar pipeline');
  
  try {
    // Copy your existing scraper logic
    const tokens = await fetchDexScreenerData();
    const analyzed = analyzeTokens(tokens);
    await storeInDatabase(analyzed);
    
    logger.info(`Processed ${analyzed.length} tokens`);
  } catch (error) {
    logger.error({ error }, 'Pipeline failed');
    throw error;
  }
}
```

## Step 4: Update Database Queries

**Old pattern:**
```typescript
await db.query('SELECT * FROM tokens WHERE symbol = $1', [symbol]);
```

**New pattern:**
```typescript
await db.query('SELECT * FROM memeradar_tokens WHERE symbol = $1', [symbol]);
```

**Helper function:**
```typescript
// Use getTableName from services/database
import { getTableName } from '../services/database';

const table = getTableName('memeradar', 'tokens');
await db.query(`SELECT * FROM ${table} WHERE symbol = $1`, [symbol]);
```

## Step 5: Test Locally (30 min)

```bash
# Terminal 1: API
npm run dev

# Terminal 2: Bots
npm run dev:bots

# Terminal 3: Pipeline
npm run dev:pipeline
```

Test each app:
- [ ] API endpoints respond correctly
- [ ] Telegram bots reply to commands
- [ ] Discord bots respond to slash commands
- [ ] Pipeline scrapers run without errors

## Step 6: Deploy Big Bang (15 min)

```bash
./scripts/deploy-big-bang.sh
```

This will:
1. Validate all API keys
2. Run database migration (if not already done)
3. Build application
4. Run tests
5. Deploy to Fly.io
6. Scale to Big Bang capacity

## Step 7: Post-Deploy Verification (15 min)

```bash
# Check overall health
curl https://king-backend.fly.dev/health

# Check specific app health
curl https://king-backend.fly.dev/health/memeradar

# View logs
fly logs --app king-backend

# Check all process groups running
fly status --app king-backend
```

## Step 8: Monitor & Scale

**First 24 hours:**
- Watch error rates: `fly logs --app king-backend | grep ERROR`
- Monitor response times: Check Fly.io dashboard
- Queue depths: Redis monitor

**Scale if needed:**
```bash
# Scale API for more traffic
fly scale count api=3 --app king-backend

# Scale workers for queue backlog
fly scale count worker=4 --app king-backend
```

## Rollback Plan

If issues arise:

```bash
# Immediate rollback to previous release
fly releases list --app king-backend
fly deploy --app king-backend --image <previous-image>

# Or full rollback to separate apps
# (Restore from database backup)
```

## Porting Checklist

For each app, verify:

- [ ] API routes working
- [ ] Telegram bot responding
- [ ] Discord bot responding (if applicable)
- [ ] Pipeline scraping data
- [ ] Database tables migrated
- [ ] Environment variables set
- [ ] Health check passing

## Apps Priority Order

Port in this order (most mature first):

1. **SpreadHunter** — Most tested
2. **DeckVault** — Stable
3. **MemeRadar** — High usage
4. **DropScout** — Stable
5. **SkinSignal** — Stable
6. **PackPal** — Simple
7. **RosterRadar** — Stable
8. **ArbWatch** — Stable
9. **DropFarm** — Phase 1
10. **LaunchRadar** — Phase 1
11. **NFTPulse** — Phase 1
12. **BotIndex** — Just built
13. **SocialIndex** — Phase 2
14. **PointTrack** — Phase 2
15. **MemeStock** — Phase 2

## Common Issues

**Issue:** Bot not responding
- Check bot token in .env
- Verify bot isn't running elsewhere (old deployment)
- Check logs: `fly logs --app king-backend --process=bots`

**Issue:** Database queries failing
- Verify table names have app prefix
- Check RLS policies updated for prefixed tables

**Issue:** Pipeline not running
- Check cron schedule in config
- Verify Redis connection
- Check logs: `fly logs --app king-backend --process=pipeline`

## Support

Questions? Check:
1. `KING_BACKEND_ARCHITECTURE.md` — Full architecture
2. `README.md` — Quick start
3. Fly.io logs — `fly logs --app king-backend`

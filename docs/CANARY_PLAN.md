# King Backend: Canary → Refactor → DevOps Plan

## Revised Strategy

Instead of Big Bang (all 15 apps at once), we'll:

1. **CANARY** — Deploy King Backend with 2 apps, validate architecture
2. **REFACTOR** — Port remaining 13 apps incrementally  
3. **DEVOPS** — Full production with monitoring, alerting, CI/CD

---

## Phase 1: CANARY (This Week)

**Goal:** Validate King Backend architecture with minimal risk

### Apps for Canary

| App | Why |
|-----|-----|
| **SpreadHunter** | Most mature, stable, proven |
| **MemeRadar** | High value, good test of pipeline + bots |

### Canary Deployment

```bash
# 1. Create canary environment
cp .env.example .env.canary
# Fill in: Supabase, Redis, 2 bot tokens

# 2. Database migration (just 2 apps)
psql $SUPABASE_URL -f database/migrations/canary-2-apps.sql

# 3. Deploy canary
cp fly.canary.toml fly.toml
fly deploy --app king-backend-canary

# 4. Enable for 5% of users
fly secrets set CANARY_PERCENTAGE=5 --app king-backend-canary
```

### Fly.io Config (Canary)

```toml
# fly.canary.toml
app = "king-backend-canary"

[processes]
  api = "node dist/api/server.js"
  bots = "node dist/bots/launcher.js"
  pipeline = "node dist/pipeline/scheduler.js"

# Single machine each (minimize cost)
[[vm]]
  size = "shared-cpu-1x"
  memory = "512mb"
```

### Success Criteria

- [ ] API responds < 200ms p95
- [ ] Bots reply to commands within 2s
- [ ] Pipeline scrapes without errors for 48h
- [ ] Zero crashes in 7 days
- [ ] Memory usage stable (< 80%)

**Cost:** ~$15/mo for canary

---

## Phase 2: REFACTOR (Week 2-3)

**Goal:** Port remaining 13 apps into validated King Backend

### Porting Order

**Batch 1 (Week 2):** DeckVault, DropScout, SkinSignal
- Similar patterns to SpreadHunter
- Test multi-app routing

**Batch 2 (Week 2):** PackPal, RosterRadar, ArbWatch
- Simple apps, quick ports

**Batch 3 (Week 3):** NFTPulse, DropFarm, LaunchRadar
- Phase 1 apps

**Batch 4 (Week 3):** BotIndex, SocialIndex, PointTrack, MemeStock
- BotIndex already built for King Backend
- Phase 2 apps

### Per-Batch Process

```bash
# 1. Port app logic (2-3 hours)
# - Copy routes
# - Copy bot handlers  
# - Copy pipeline
# - Update table names

# 2. Database migration
psql $SUPABASE_URL -f database/migrations/add-{app}.sql

# 3. Deploy to canary
fly deploy --app king-backend-canary

# 4. Validate (24 hours)
# - Test all commands
# - Check logs
# - Verify data flow

# 5. Commit to main
```

### Migration Scripts

Create per-app migrations instead of Big Bang:

```sql
-- database/migrations/add-deckvault.sql
ALTER TABLE IF EXISTS collections RENAME TO deckvault_collections;
ALTER TABLE IF EXISTS cards RENAME TO deckvault_cards;
-- etc
```

---

## Phase 3: DEVOPS (Week 4)

**Goal:** Production-ready infrastructure with full observability

### Production Deployment

```bash
# 1. Promote canary to production
./scripts/canary-promote.sh

# 2. Scale up
fly scale count api=2 worker=2 --app king-backend

# 3. Enable monitoring
# - Sentry error tracking
# - Datadog/Grafana metrics
# - PagerDuty alerts
```

### DevOps Checklist

**Monitoring:**
- [ ] Error tracking (Sentry)
- [ ] Metrics (Fly.io + external)
- [ ] Logs aggregation
- [ ] Uptime monitoring

**Alerting:**
- [ ] API error rate > 1%
- [ ] Response time > 500ms
- [ ] Bot disconnection
- [ ] Pipeline failures

**CI/CD:**
- [ ] GitHub Actions workflow
- [ ] Automated tests
- [ ] Staging environment
- [ ] Automated deployment

**Runbooks:**
- [ ] Incident response
- [ ] Rollback procedures
- [ ] Scaling procedures
- [ ] Database recovery

---

## Timeline

| Week | Phase | Activities | Cost |
|------|-------|-----------|------|
| 1 | **CANARY** | Deploy 2 apps, validate | $15/mo |
| 2 | **REFACTOR** | Port batches 1-2 | $15/mo |
| 3 | **REFACTOR** | Port batches 3-4 | $15/mo |
| 4 | **DEVOPS** | Production hardening | $60/mo |

**Total time to production:** 4 weeks  
**Risk:** Low (incremental validation)  
**Cost ramp:** Gradual (validate before scaling)

---

## Decision Points

### After Canary (Week 1)

**If canary fails:**
- Fix issues in canary environment
- Keep existing 15 separate apps running
- No user impact

**If canary succeeds:**
- Proceed to Refactor phase
- Begin porting remaining apps

### After Refactor (Week 3)

**All 15 apps ported:**
- Proceed to DevOps phase
- Production deployment

**Issues found:**
- Fix in canary
- Delay production

---

## Comparison: Canary vs Big Bang

| Factor | Big Bang | Canary |
|--------|----------|--------|
| Risk | High (all at once) | Low (incremental) |
| Time to validate | 1 week | 1 week |
| Rollback complexity | Hard | Easy |
| User impact if fails | All apps | 2 apps |
| Cost validation | After deployment | During canary |
| Confidence level | Medium | High |

**Recommendation:** Canary approach ☦️

---

## Immediate Next Steps

1. **Choose 2 canary apps** — SpreadHunter + MemeRadar recommended
2. **Port just those 2** — 2-3 hours of work
3. **Deploy canary** — 15 min
4. **Validate for 1 week** — Monitor, test, refine
5. **Decision point** — Proceed or pivot

Ready to start Phase 1 (Canary)?

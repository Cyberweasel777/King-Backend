# King Backend — Canary Deployment

**3 Apps:** BotIndex, MemeRadar, ArbWatch  
**Status:** Skeleton ready — paste your code  
**Next:** Stripe integration after your code works

---

## Quick Start

```bash
cd king-backend

# 1. Install dependencies
npm install

# 2. Copy environment file
cp .env.example .env
# Edit .env with your tokens

# 3. Run dev server
npm run dev

# 4. Test health endpoints
curl http://localhost:8080/health
curl http://localhost:8080/api/botindex/health
curl http://localhost:8080/api/memeradar/health
curl http://localhost:8080/api/arbwatch/health
```

---

## Structure

```
king-backend/src/
├── api/
│   ├── server.ts              # Main server (TODO: none — ready)
│   ├── routes/
│   │   ├── index.ts           # Route registry (TODO: none)
│   │   ├── botindex.ts        # ⭐ API endpoints (TODO: paste code)
│   │   ├── memeradar.ts       # ⭐ API endpoints (TODO: paste code)
│   │   └── arbwatch.ts        # ⭐ API endpoints (TODO: paste code)
│   └── middleware/
│       └── errorHandler.ts    # Error handling (TODO: none)
│
├── bots/
│   ├── launcher.ts            # Bot orchestrator (TODO: none)
│   └── telegram/handlers/
│       ├── botindex.ts        # ⭐ Bot commands (TODO: paste code)
│       ├── memeradar.ts       # ⭐ Bot commands (TODO: paste code)
│       └── arbwatch.ts        # ⭐ Bot commands (TODO: paste code)
│
├── shared/payments/           # ✅ STRIPE MODULE (complete)
│   ├── types.ts
│   ├── config.ts
│   ├── database.ts
│   ├── stripe-client.ts
│   ├── webhook-handler.ts
│   ├── access-control.ts
│   ├── meta-capi.ts
│   └── index.ts
│
└── config/
    └── apps.ts                # App registry (TODO: none)
```

---

## TODO Markers

Look for `TODO:` comments in these files:

### API Routes (paste your working code)
- `src/api/routes/botindex.ts` — Signal endpoints
- `src/api/routes/memeradar.ts` — Token endpoints  
- `src/api/routes/arbwatch.ts` — Arbitrage endpoints

### Bot Handlers (paste your working code)
- `src/bots/telegram/handlers/botindex.ts` — Bot commands
- `src/bots/telegram/handlers/memeradar.ts` — Bot commands
- `src/bots/telegram/handlers/arbwatch.ts` — Bot commands

### After Paste
Remove the `// STUB:` sections and test.

---

## API Endpoints (Ready)

### Shell API (additive, staged rollout)

- `GET /api/:app/shell/feature-flags`
- `GET /api/:app/shell/signal-summary`
- `GET /api/:app/shell/opportunity-timeline`
- `GET /api/:app/shell/entitlement-status`
- `GET /api/:app/shell/pricing-metadata`
- `GET /api/:app/shell/status-block`

Rollout is controlled by `SHELL_ROLLOUT_PHASE` (`P1`→`P5`) and optional `SHELL_FEATURE_OVERRIDES`.
See `docs/SHELL_ROLLOUT_FLY.md` for production deployment + smoke tests.

| App | Endpoint | Status |
|-----|----------|--------|
| BotIndex | `GET /api/botindex/health` | ✅ Ready |
| BotIndex | `GET /api/botindex/signals` | ⭐ TODO: Paste code |
| BotIndex | `GET /api/botindex/correlation` | ⭐ TODO: Paste code |
| MemeRadar | `GET /api/memeradar/health` | ✅ Ready |
| MemeRadar | `GET /api/memeradar/tokens` | ⭐ TODO: Paste code |
| MemeRadar | `GET /api/memeradar/trending` | ⭐ TODO: Paste code |
| ArbWatch | `GET /api/arbwatch/health` | ✅ Ready |
| ArbWatch | `GET /api/arbwatch/opportunities` | ⭐ TODO: Paste code |
| ArbWatch | `POST /api/arbwatch/positions` | ⭐ TODO: Paste code |

---

## Stripe Integration (After Paste)

Once your code works, add payment gating:

```typescript
import { withSubscription } from '../../shared/payments';

// Gate premium endpoint
router.get('/correlation', 
  withSubscription('botindex', 'pro'),
  async (req, res) => {
    // Your working code here
  }
);
```

Premium commands are already stubbed in bot handlers — just uncomment the `withSubscription` middleware.

---

## Deployment

```bash
# 1. Build
npm run build

# 2. Deploy to Fly.io
fly deploy

# 3. Set secrets
fly secrets set BOTINDEX_BOT_TOKEN=your-token
fly secrets set BOTINDEX_STRIPE_SECRET_KEY=sk_live_...
# ... etc

# 4. Scale processes
fly scale count api=1 bots=1
```

---

## Files Created

| Phase | Files | Purpose |
|-------|-------|---------|
| Core | 9 | Server, routes, bots, config |
| Payments | 8 | ✅ Stripe module (from Phase 2-4) |
| Canary | 6 | API + bot placeholders with TODOs |
| Config | 4 | Package, TS, Fly, Env |
| **Total** | **27** | **Ready for your code** |

---

## Next Steps

1. **Paste your working code** into the TODO sections
2. **Test locally** — all endpoints should return real data
3. **Add Stripe** — gate premium features
4. **Deploy** — fly deploy
5. **Follow-up refactor** — optimize after live

---

**Mission Control:** http://192.168.68.51:8888

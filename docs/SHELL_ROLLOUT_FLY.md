# Production Shell + P1→P5 Rollout (Fly.io)

This document covers the new shell endpoints, feature-flag rollout strategy, and production deploy checklist for `king-backend`.

## New Additive API Surface

All endpoints are additive and mounted under:

- `GET /api/:app/shell/feature-flags`
- `GET /api/:app/shell/signal-summary?windowHours=24`
- `GET /api/:app/shell/opportunity-timeline?days=14&limit=30`
- `GET /api/:app/shell/entitlement-status?userId=<id>`
- `GET /api/:app/shell/pricing-metadata`
- `GET /api/:app/shell/status-block`

Supported `:app` values remain aligned with payment app IDs.

## Feature Flags (P1→P5)

Rollout is controlled by environment variables:

- `SHELL_ROLLOUT_PHASE` (`P1` | `P2` | `P3` | `P4` | `P5`)
- `SHELL_FEATURE_OVERRIDES` (optional CSV)
  - Example: `signalSummary=true,opportunityTimeline=true,dashboardStatusBlock=false`

Default phase behavior:

- **P1**: `signalSummary`
- **P2**: + `opportunityTimeline`
- **P3**: + `entitlementStatus`
- **P4**: + `pricingMetadata`
- **P5**: + `dashboardStatusBlock`

If a feature is not enabled in the current phase, endpoint returns:

```json
{ "error": "feature_not_enabled", "phase": "P2" }
```

## Environment Additions

Add to Fly secrets / runtime env:

```bash
fly secrets set SHELL_ROLLOUT_PHASE=P1
fly secrets set SHELL_FEATURE_OVERRIDES=""
```

## Fly Deploy Notes

### 1) Validate locally

```bash
npm ci
npm run typecheck
npm run build
```

### 2) Deploy

```bash
fly deploy --remote-only
```

### 3) Set/rotate required secrets

```bash
fly secrets set SUPABASE_URL=... SUPABASE_SERVICE_KEY=...
fly secrets set REDIS_URL=redis://...
fly secrets set PAYMENT_ADMIN_IDS=8063432083
fly secrets set API_BASE_URL=https://king-backend.fly.dev

# rollout flags
fly secrets set SHELL_ROLLOUT_PHASE=P1
fly secrets set SHELL_FEATURE_OVERRIDES=""
```

### 4) Verify machine/process health

```bash
fly status
fly logs --app king-backend
curl https://king-backend.fly.dev/health
```

## Smoke-Test Checklist

Use a known app (e.g. `botindex`) and valid user ID for entitlement checks.

```bash
BASE="https://king-backend.fly.dev"
APP="botindex"
USER_ID="8063432083"

curl "$BASE/health"
curl "$BASE/api/$APP/shell/feature-flags"
curl "$BASE/api/$APP/shell/signal-summary?windowHours=24"
curl "$BASE/api/$APP/shell/opportunity-timeline?days=7&limit=7"
curl "$BASE/api/$APP/shell/entitlement-status?userId=$USER_ID"
curl "$BASE/api/$APP/shell/pricing-metadata"
curl "$BASE/api/$APP/shell/status-block"
```

Expected behavior:

- 200 for enabled features in current phase.
- 404 with `feature_not_enabled` for staged features not yet rolled out.
- 400 with `invalid_request` for malformed query params.
- Existing endpoints (`/health`, `/api/:app/payments/*`, canary routes) remain unchanged.

## Backward Compatibility Notes

- No existing route paths were changed.
- No destructive migration added.
- New routes are additive under `/api/:app/shell/*`.
- Existing payment and app health routes remain intact.

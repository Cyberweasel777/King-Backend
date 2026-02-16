# Canary Lessons — King Backend (Fly)

This is a distilled checklist of what we learned shipping the **King Backend** canary (BotIndex, MemeRadar, ArbWatch) and what to apply to future projects to ship faster and with fewer regressions.

## 0) Guiding principle
**Ship one “real” vertical end-to-end first** (data → API → gating → deploy) before scaling to 10+ apps.

## 1) Deploy stability: lockfiles + build determinism
- **Always keep `package-lock.json` in sync** with `package.json`.
  - Fly/Depot uses `npm ci` (and `npm ci --only=production`) which *hard-fails* when the lock is stale.
  - Fix pattern: `npm install --package-lock-only` → commit → deploy.
- Prefer deterministic installs over “it works on my machine”.

## 2) Fly process groups: only run what you use
- Each process group costs money and noise.
- If a process isn’t wired (e.g. pipeline scheduler logging “No pipeline engine found”), **remove it from `fly.toml`** or scale it to 0.
- Use rolling deploys; keep at least 2 API machines for continuity.

## 3) Payments gating: make it actionable
- 401/402 errors must return **what the client should do next**.
  - 401: missing user identity (header/query).
  - 402: include a **clickable `checkoutUrl`**.
- Return absolute URLs when possible (protocol + host from forwarded headers).

## 4) “Trending” data sources: validate upstream assumptions
- Search endpoints are not “trending”. They’re often unordered, cross-chain, or misleading.
- For DexScreener:
  - `token-profiles/latest/v1` is the right starting point for “what’s boosted/promoted”.
  - Some token/pair fields are **missing** (liquidity/volume/txns). Treat as optional.
  - Add warnings / data-quality flags instead of crashing.

## 5) Defensive parsing: never trust upstream fields
- Optional chaining + defaults prevent cascading failures.
- Choose “best pair” using a score that prefers completeness (liquidity+volume+txns present), not just a single field.
- When critical fields are missing, use a fallback endpoint (e.g. hydrate pair liquidity once).

## 6) Debug modes accelerate integration
- Adding `?debug=true` to endpoints is a force multiplier.
  - Return counters like: signatures fetched, tx detail attempts, parsed transfers, first error.
  - This turns “empty array” from a mystery into an explainable state.

## 7) Limits + caching: keep costs predictable
- Put a hard cap on fanout calls (Helius tx detail hydration capped to 10).
- Cache results by effective limit (not requested limit) to avoid wasting work.
- For heavy endpoints (ArbWatch opportunities), introduce TTL caching before broad adoption.

## 8) UX: pre-bake demo inputs
- Provide demo/test endpoints like:
  - `/api/memeradar/whales/demo`
- This enables UI + QA even when the user doesn’t have real inputs yet.

## 9) ArbWatch matching: string equality won’t cut it
- Even with working scrapers, cross-market matching is sparse if it depends on exact question overlap.
- Next step patterns:
  - fuzzy text matching,
  - canonicalization via LLM/embeddings,
  - caching + scraper status in response meta.

## 10) Security (keep lightweight, but don’t be reckless)
- Rotate leaked secrets.
- Avoid accepting arbitrary redirect URLs for checkout success/cancel (open-redirect/phishing risk).
- Defer heavier auth until you have product pull, but keep the blast radius small.

---

## 11) MemeRadar v1 ship-readiness lessons (Telegram + risk engine)
- **Kill stubs early.** A command that returns fake data (`/token`, `/trending`, `/whales`) creates false confidence and delays real QA.
- **Score output must include explainability.** A numeric provenance score is not enough; always attach confidence + top risk factors + “why flagged”.
- **Alert logic needs anti-spam guardrails from day one.** Add per-cycle caps, dedupe windows, and subscriber opt-in (`/alerts_on`, `/alerts_off`) before public rollout.
- **Use “real-time-ish” language unless you have streaming infra.** Polling every few minutes is fine for MVP, but label it honestly and timestamp messages.
- **Handle Telegram Markdown safely.** Escape/sanitize command input before echoing user-supplied token strings.
- **Rate limits are product logic, not just infra logic.** Put per-user command limits in the bot layer to protect API costs and prevent abuse.
- **Quality fallback beats empty output.** If upstream data is partial, return a useful response with warnings instead of silent empty lists.
- **Daily digest should track deltas, not just snapshots.** Users care more about score/risk *changes* than absolute values.

## Fast-shipping template to apply to future apps
For each new app, ship in this order:
1) `/health`
2) One real endpoint returning real data (with caching)
3) Add `?debug=true` instrumentation
4) Add gating (401/402 with checkoutUrl)
5) Deploy + smoke-test via curl scripts
6) Only then add bots/alerts/pipelines
7) Add anti-spam controls (rate limits + alert dedupe/caps) before public launch

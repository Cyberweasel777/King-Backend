# King Backend — Refactor Playbook

> Lessons from MemeRadar production-readiness refactor (Feb 16, 2026).
> Apply these patterns to all 12 bot handlers.

---

## 1. The Problem We Solved

MemeRadar's handler was a 313-line monolith: rate limiting, markdown escaping, argument parsing, alert scheduling, error handling — all inline. Every other handler has the same disease.

**Before:** one fat file per app, duplicated utilities, bare `console.error`, no lifecycle control.

**After:** 3 clean modules with single responsibilities.

---

## 2. Extraction Pattern (Apply to All Apps)

### Step 1: Shared Bot Middleware → `bots/telegram/shared/middleware.ts`

Already extracted. **Every handler should import from here instead of re-declaring:**

| Utility | Signature | Notes |
|---------|-----------|-------|
| `allowCommand` | `(userId: string \| undefined, config?: RateLimitConfig) => boolean` | Per-user sliding window. Default: 12 req/60s |
| `escapeMd` | `(input: string) => string` | Telegram MarkdownV1 safe |
| `extractArg` | `(text: string \| undefined, maxLength?: number) => string` | Strips `/command`, caps at 120 chars |
| `shortAddress` | `(address: string) => string` | `abc123...xyz9` display format |

**Action for each handler:** Delete local copies of these functions. Import from `../shared/middleware`.

### Step 2: Background Loops → `services/{app}/scheduler.ts`

Any handler with `setInterval` for alerts/digests/polling should extract to a Scheduler class:

```typescript
export class AppScheduler {
  private bot: Telegraf;
  private subscribers = new Set<number>();
  private started = false;
  private intervals: ReturnType<typeof setInterval>[] = [];

  constructor(bot: Telegraf) { this.bot = bot; }

  subscribe(chatId: number): void { this.subscribers.add(chatId); }
  unsubscribe(chatId: number): void { this.subscribers.delete(chatId); }

  start(): void {
    if (this.started) return;
    this.started = true;
    // register intervals, push to this.intervals[]
  }

  stop(): void {
    this.intervals.forEach(clearInterval);
    this.intervals = [];
    this.started = false;
  }
}
```

**Why:** Clean start/stop lifecycle. Testable. No leaked intervals. Handler stays focused on command wiring.

### Step 3: Error Handling Pattern

Wrap every data-fetching command in try/catch with contextual logging:

```typescript
bot.command('something', async (ctx) => {
  if (!rateGuard(ctx)) {
    await ctx.reply('⏱️ Rate limit hit. Wait a minute and try again.');
    return;
  }

  try {
    // ... business logic ...
  } catch (err) {
    console.error(`${LOG} /something failed ${chatMeta(ctx)}`, err);
    await ctx.reply('⚠️ Something went wrong. Try again shortly.');
  }
});
```

Helper for consistent metadata:

```typescript
const LOG = '[AppName]';
function chatMeta(ctx: Context): string {
  return `user=${ctx.from?.id ?? '?'} chat=${ctx.chat?.id ?? '?'}`;
}
```

**Global catch** should be non-throwing:
```typescript
bot.catch((err: any, ctx: Context) => {
  console.error(`${LOG} unhandled ${chatMeta(ctx)}`, err);
  ctx.reply('⚠️ Error. Retry shortly.').catch(() => {});
});
```

---

## 3. Which Handlers Need This

| Handler | Has Duped Utils | Has setInterval | Needs Refactor |
|---------|----------------|-----------------|----------------|
| memeradar | ✅ DONE | ✅ DONE | ✅ DONE |
| botindex | ✅ yes | ? | **YES** |
| nichehunter | ? | ? | **check** |
| chainpulse | ? | ? | **check** |
| whalewatcher | ? | ? | **check** |
| signloracle | ? | ? | **check** |
| spreadhunter | ? | ? | **check** |
| arbwatch | ? | ? | **check** |
| validatorx | ? | ? | **check** |
| airdrophunter | ? | ? | **check** |
| deckvault | ? | ? | **check** |
| yieldhunter | ? | ? | **check** |

**Execution strategy:** Batch 3-4 handlers per session. Use Kimi sub-agents (they handled MemeRadar cleanly). Each agent gets one handler + the middleware import + error wrapping. Typecheck gate before merge.

---

## 4. API Route Hardening (Parallel Track)

MemeRadar's API route (`api/routes/memeradar.ts`) already has input validation for wallet addresses. Apply same pattern to all API routes:

- **Input bounds:** `Math.min(limit, 50)`, string `.trim().slice(0, maxLen)`
- **Typed query params:** explicit cast, fallback defaults
- **Consistent error shapes:** `{ error: 'error_code', message: 'Human readable' }`
- **No raw exceptions leaking to client**

---

## 5. Reusable Templates

### New Bot Handler Template

```typescript
import { Telegraf, Context } from 'telegraf';
import {
  withSubscription,
  createStatusCommand,
  createPricingCommand,
  createSubscribeCommand,
} from '../../shared/payments';
import { allowCommand, escapeMd, extractArg, shortAddress } from '../shared/middleware';
// import service layer
// import scheduler if needed

const APP_ID = 'appname' as const;
const LOG = '[AppName]';

function rateGuard(ctx: Context): boolean {
  return allowCommand(ctx.from?.id?.toString());
}

function chatMeta(ctx: Context): string {
  return `user=${ctx.from?.id ?? '?'} chat=${ctx.chat?.id ?? '?'}`;
}

export function createAppBot(token: string) {
  const bot = new Telegraf(token);

  bot.command('start', async (ctx) => { /* welcome */ });
  bot.command('help', async (ctx) => { /* command list */ });

  bot.command('status', createStatusCommand(APP_ID));
  bot.command('pricing', createPricingCommand(APP_ID));
  bot.command('subscribe', createSubscribeCommand(APP_ID));

  // ... commands with rateGuard + try/catch ...

  bot.catch((err: any, ctx: Context) => {
    console.error(`${LOG} unhandled ${chatMeta(ctx)}`, err);
    ctx.reply('⚠️ Error. Retry shortly.').catch(() => {});
  });

  return bot;
}

export default createAppBot;
```

---

## 6. Key Takeaways

1. **Shared middleware pays off immediately** — one file eliminates ~30 duplicated lines per handler × 12 handlers = ~360 lines of dead weight.
2. **Scheduler class pattern** — any `setInterval` in a handler is a code smell. Extract it. Give it lifecycle hooks.
3. **Error handling is table stakes** — bare `console.error` without context (which user? which chat? which command?) is useless in prod.
4. **Sub-agents work for mechanical refactors** — give them the exact extraction spec, the import paths, and a typecheck gate. They execute cleanly.
5. **Typecheck is the gate, not tests** — for refactors that preserve behavior, `tsc --noEmit` catches 95% of breakage. Full integration tests are a separate concern.
6. **Don't scope-creep during refactors** — we didn't add features, change UX, or touch command output formats. Discipline.

---

*Last updated: 2026-02-16 — post MemeRadar refactor*

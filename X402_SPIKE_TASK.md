# x402 Payment Spike for King Backend

## Context
King Backend is an Express/TypeScript API server that currently uses Stripe for human payments.
We want to add x402 (HTTP 402 Payment Required) as a parallel payment gate for AI agent consumers.

## Objective
Create an Express middleware that gates specific endpoints behind x402 USDC payments on Base Sepolia (testnet).

## What to build

### 1. Install x402 SDK
```bash
npm install x402-express @coinbase/coinbase-sdk
```
If `x402-express` doesn't exist as a package, check the Coinbase x402 GitHub repo for the correct package name. The official TypeScript SDK is at `https://github.com/coinbase/x402/tree/main/typescript`. Try:
- `npm install x402` or
- `npm install @coinbase/x402`

If none work, implement the middleware manually following the x402 spec:
- Return HTTP 402 with `X-Payment-Required` header containing JSON payment requirements
- Accept payment proof via `X-Payment` header
- Verify payment on-chain before allowing request through

### 2. Create middleware: `src/api/middleware/x402Gate.ts`

The middleware should:
- Check for `X-Payment` header (or whatever the x402 spec uses)
- If missing, return 402 with payment requirements (price in USDC, wallet address, network)
- If present, verify the payment and allow through
- Config via env vars: `X402_WALLET_ADDRESS`, `X402_NETWORK` (default: base-sepolia), `X402_ENABLED` (default: false)

### 3. Create a test route: `src/api/routes/x402-test.ts`

Simple route that demonstrates x402 gating:
```typescript
GET /api/botindex/x402/correlation-leaders
```
- Gated by x402 middleware ($0.01 USDC per request on testnet)
- Returns the same data as the existing correlation leaders endpoint
- Mount it in the botindex router

### 4. Update server.ts
- Import and conditionally mount x402 test routes (only when X402_ENABLED=true)

### 5. Add to .env.example
```
# x402 Agent Payments (testnet)
X402_ENABLED=false
X402_WALLET_ADDRESS=
X402_NETWORK=base-sepolia
```

### 6. Create docs/X402_INTEGRATION.md
- What x402 is
- How agents pay for API calls
- How to test with Base Sepolia testnet USDC
- How to switch to mainnet

## Constraints
- DO NOT modify existing Stripe payment flows
- DO NOT touch existing routes/middleware
- This is additive only — a parallel payment path
- Use TypeScript strict mode
- Follow existing code conventions (pino logger, zod validation, Express patterns)
- If the x402 npm packages don't exist or don't work, build a minimal manual implementation following the spec at https://github.com/coinbase/x402

## Files to create/modify
- CREATE: src/api/middleware/x402Gate.ts
- CREATE: src/api/routes/x402-test.ts  
- CREATE: docs/X402_INTEGRATION.md
- MODIFY: src/api/routes/botindex.ts (mount x402 test route)
- MODIFY: .env.example (add x402 vars)
- MODIFY: package.json (add x402 dependency)

## When done
Commit all changes with message: "spike: add x402 HTTP payment gate for agent API access"
Then run: openclaw system event --text "Done: x402 spike complete — middleware + test route + docs created" --mode now

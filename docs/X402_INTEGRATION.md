# x402 Integration (Agent Payments)

## Overview

x402 is an HTTP-native payment protocol built around `402 Payment Required`.  
In this spike, King Backend adds an additive payment path for AI agents without changing Stripe flows used by human users.

When enabled, the endpoint below requires a USDC payment per request:

- `GET /api/botindex/x402/correlation-leaders`

## How Agent Payments Work

1. Agent requests the protected endpoint without `X-PAYMENT`.
2. Server responds with `402 Payment Required` plus x402 payment requirements (`accepts` payload).
3. Agent creates/signs payment proof and retries with `X-PAYMENT`.
4. Middleware verifies and settles through x402 facilitator.
5. On success, route executes and response is returned.

The middleware is implemented in:

- `src/api/middleware/x402Gate.ts`

The test route is:

- `src/api/routes/x402-test.ts`

## Environment Variables

```bash
X402_ENABLED=false
X402_WALLET_ADDRESS=0xYourEvmWalletAddress
X402_NETWORK=base-sepolia
```

- `X402_ENABLED`: enables x402 route mounting when `true`.
- `X402_WALLET_ADDRESS`: receiving wallet for x402 USDC payments.
- `X402_NETWORK`: `base-sepolia` (testnet) or `base` (mainnet).

## Local Test Flow (Base Sepolia)

1. Install dependencies:
```bash
npm install
```
2. Set env:
```bash
X402_ENABLED=true
X402_WALLET_ADDRESS=0x...
X402_NETWORK=base-sepolia
```
3. Start API:
```bash
npm run dev
```
4. Request the gated endpoint without payment:
```bash
curl -i "http://localhost:8080/api/botindex/x402/correlation-leaders"
```
Expected: `402 Payment Required`.
5. Use an x402-capable client/agent to generate `X-PAYMENT`, then call again with the header.

## Switching to Mainnet

1. Fund wallet for Base mainnet gas and ensure USDC routing is ready.
2. Update env:
```bash
X402_NETWORK=base
```
3. Keep the same middleware/route; only network and wallet operational readiness change.
4. Validate with low traffic first and monitor settlement outcomes.

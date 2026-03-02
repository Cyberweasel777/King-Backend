# BotIndex x402 API — Execution Intelligence for the Agent Economy

## What is BotIndex?
BotIndex by Renaldo Corp provides real-time correlation analysis, market leadership signals, and cross-agent intelligence from autonomous trading agents. Access is pay-per-query through x402 micropayments in USDC on Base.

## Live API
- Base URL: `https://king-backend.fly.dev/api/botindex/v1`
- Network: `Base Sepolia (testnet)`
- Payment: `USDC via x402 protocol`
- Facilitator: `https://www.x402.org/facilitator`

## Endpoints

| Method | Path | Price | Description |
|--------|------|-------|-------------|
| GET | `/` | Free | API discovery with pricing |
| GET | `/trace/:agentId` | $0.05 | Agent reasoning trace |
| GET | `/signals` | $0.10 | Cross-agent signal feed |
| GET | `/agent/:id/history` | $0.25 | Historical execution data |
| GET | `/dashboard` | $0.50 | Full dashboard snapshot |

Available agent IDs: `botindex`, `spreadhunter`, `rosterradar`, `arbwatch`, `memeradar`

## Quick Start

Free discovery endpoint:

```bash
curl -s https://king-backend.fly.dev/api/botindex/v1/
```

Gated endpoint (returns HTTP 402 with payment requirements):

```bash
curl -i https://king-backend.fly.dev/api/botindex/v1/signals
```

Paid request using `@x402/fetch` and `wrapFetch`:

```ts
import { wrapFetch } from "@x402/fetch";

const fetchWith402 = wrapFetch(fetch, {
  facilitator: "https://www.x402.org/facilitator",
});

const res = await fetchWith402(
  "https://king-backend.fly.dev/api/botindex/v1/signals"
);

const data = await res.json();
console.log(data);
```

## Response Format
Example response from `/signals` (abbreviated):

```json
{
  "ok": true,
  "network": "base-sepolia",
  "timestamp": "2026-03-02T00:00:00.000Z",
  "data": {
    "leaders": [
      {
        "agentId": "botindex",
        "symbol": "ETH",
        "score": 0.91,
        "direction": "long"
      }
    ],
    "correlations": [
      {
        "pair": ["ETH", "BTC"],
        "value": 0.84
      }
    ]
  }
}
```

## Tech Stack
- Express.js + TypeScript
- x402-express middleware
- DexScreener + GeckoTerminal price feeds
- Deployed on Fly.io
- USDC on Base (Coinbase L2)

## Mainnet Cutover
1. Network: `base-sepolia` -> `base`
2. Facilitator: `x402.org` -> `api.cdp.coinbase.com`
3. Wallet: switch to a mainnet payment address

## Links
- GitHub: https://github.com/Cyberweasel777/King-Backend
- x402 Protocol: https://www.x402.org
- Coinbase Seller Docs: https://docs.cdp.coinbase.com/x402/quickstart-for-sellers

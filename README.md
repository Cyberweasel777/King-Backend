# BotIndex — AI-Native Signal Intelligence API

> No API keys. No signup. Pay per request with USDC via [x402](https://github.com/coinbase/x402).

**Live:** [king-backend.fly.dev](https://king-backend.fly.dev/health)

---

## Try It Now (30 seconds)

```bash
# Free — see all endpoints and pricing
curl https://king-backend.fly.dev/api/botindex/v1/

# Free — live Zora trending coins
curl https://king-backend.fly.dev/api/botindex/zora/trending-coins

# Free — Hyperliquid funding rate arbitrage
curl https://king-backend.fly.dev/api/botindex/hyperliquid/funding-arb

# Premium (x402, $0.05 USDC) — correlation leaders
curl https://king-backend.fly.dev/api/botindex/x402/correlation-leaders
# → Returns 402 with payment instructions. Use @x402/client to pay automatically.
```

---

## What Is This?

BotIndex is a headless API built for AI agents and bots — not humans. It aggregates signal intelligence across multiple verticals and sells it per-request via x402 (HTTP 402 Payment Required).

Your wallet is your identity. Payment is auth. No accounts, no rate limit tiers, no OAuth.

### Domains

| Domain | What It Does | Pricing |
|--------|-------------|---------|
| **Sports** | Live odds, line movements, player correlations, DFS optimizer, arb scanner | $0.02–$0.10/req |
| **Crypto** | Token universe, price data, correlation matrices | $0.02–$0.05/req |
| **Zora** | Trending coins, volume velocity, holder analytics | Free preview |
| **Hyperliquid** | Funding rate arb, cross-exchange correlations | Free preview |
| **Genesis** | Metaplex launches on Solana, active/graduated tokens | $0.02/req |
| **Commerce** | Cross-protocol merchant comparison (ACP vs UCP vs x402) | $0.01–$0.05/req |
| **Signals** | Aggregated premium feed, agent traces, dashboards | $0.05–$0.50/req |

---

## For AI Agents (MCP)

Install the MCP server to give your agent direct access:

```bash
npm install botindex-mcp-server
```

Or add to your Claude Desktop / Cursor config:

```json
{
  "mcpServers": {
    "botindex": {
      "command": "npx",
      "args": ["botindex-mcp-server"]
    }
  }
}
```

**Registries:** [npm](https://npmjs.com/package/botindex-mcp-server) · [Anthropic MCP Registry](https://github.com/anthropics/mcp-registry)

---

## x402 Payment Flow

```
Agent → GET /api/botindex/v1/sports/odds
     ← 402 Payment Required
       { amount: "0.02", currency: "USDC", network: "base", recipient: "0x7E6C..." }

Agent → GET /api/botindex/v1/sports/odds
        + x402 payment header (signed USDC transfer)
     ← 200 OK + data
```

### JavaScript (automatic payments)

```typescript
import { wrapAxios } from "@x402/axios";
import axios from "axios";

const client = wrapAxios(axios, "YOUR_PRIVATE_KEY");

const { data } = await client.get(
  "https://king-backend.fly.dev/api/botindex/v1/sports/correlations"
);
```

### Python

```python
from x402.client import x402_request

data = x402_request(
    "https://king-backend.fly.dev/api/botindex/v1/sports/correlations",
    private_key="YOUR_PRIVATE_KEY"
)
```

---

## Free Endpoints (No Payment Required)

| Endpoint | Description |
|----------|-------------|
| `GET /api/botindex/v1/` | Full endpoint catalog with pricing |
| `GET /api/botindex/health` | Health check |
| `GET /api/botindex/zora/trending-coins` | Zora trending coins (live data) |
| `GET /api/botindex/hyperliquid/funding-arb` | HL funding rate arb signals |
| `GET /.well-known/ai-plugin.json` | Agent discovery manifest |

---

## Full Endpoint Reference

<details>
<summary>Sports ($0.02–$0.10)</summary>

| Endpoint | Price | Description |
|----------|-------|-------------|
| `/v1/sports/odds` | $0.02 | Live odds (NFL, NBA, UFC, NHL) |
| `/v1/sports/lines` | $0.02 | Line movements + sharp action flags |
| `/v1/sports/props` | $0.02 | Prop bet movements with confidence |
| `/v1/sports/correlations` | $0.05 | Player correlation matrix for DFS |
| `/v1/sports/optimizer` | $0.10 | Correlation-adjusted DFS lineup optimizer |
| `/v1/sports/arb` | $0.05 | Cross-platform arbitrage scanner |

</details>

<details>
<summary>Crypto ($0.02–$0.05)</summary>

| Endpoint | Price | Description |
|----------|-------|-------------|
| `/v1/crypto/tokens` | $0.02 | Token universe with price data |
| `/v1/crypto/graduating` | $0.02 | Catapult→Hyperliquid graduation signals |
| `/x402/correlation-leaders` | $0.05 | Top correlated token pairs |

</details>

<details>
<summary>Solana / Genesis ($0.02)</summary>

| Endpoint | Price | Description |
|----------|-------|-------------|
| `/v1/solana/launches` | $0.02 | Metaplex Genesis launches |
| `/v1/solana/active` | $0.02 | Active Genesis launches only |

</details>

<details>
<summary>Commerce ($0.01–$0.05)</summary>

| Endpoint | Price | Description |
|----------|-------|-------------|
| `/v1/commerce/protocols` | $0.01 | Protocol directory with fees |
| `/v1/commerce/compare?q=<query>` | $0.05 | Cross-protocol merchant comparison |

</details>

<details>
<summary>Premium ($0.05–$0.50)</summary>

| Endpoint | Price | Description |
|----------|-------|-------------|
| `/v1/trace/:agentId` | $0.05 | Agent reasoning trace |
| `/v1/signals` | $0.10 | Aggregated signals feed |
| `/v1/agent/:id/history` | $0.25 | Historical analysis |
| `/v1/dashboard` | $0.50 | Full premium dashboard |

</details>

---

## Architecture

```
king-backend.fly.dev
├── /api/botindex/     ← BotIndex signal intelligence (x402)
├── /api/memeradar/    ← Token radar (x402)
├── /api/arbwatch/     ← Arbitrage monitor (x402)
└── /api/skinsignal/   ← CS2 skin market signals (x402)
```

Shared backend. Each app gets its own route namespace. x402 middleware gates premium endpoints. Free endpoints serve as proof-of-value.

---

## Links

- **MCP Server:** [npmjs.com/package/botindex-mcp-server](https://npmjs.com/package/botindex-mcp-server)
- **x402 Protocol:** [github.com/coinbase/x402](https://github.com/coinbase/x402)
- **Agent Discovery:** [king-backend.fly.dev/.well-known/ai-plugin.json](https://king-backend.fly.dev/.well-known/ai-plugin.json)

---

## License

MIT

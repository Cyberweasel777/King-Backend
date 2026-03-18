# BotIndex — Crypto Market Intelligence API

> **Raw data is a commodity. Intelligence isn't.**

BotIndex synthesizes whale positions, developer activity, funding rates, and behavioral demand signals into predictive intelligence. Not another data aggregator — a convergence engine.

**Live:** [botindex.dev](https://botindex.dev) · **API:** [api.botindex.dev](https://api.botindex.dev/api/botindex/sentinel/track-record) · **Track Record:** [Live prediction accuracy](https://api.botindex.dev/api/botindex/sentinel/track-record)

---

## What Makes This Different

Everyone has CoinGecko data. Nobody has this:

| Signal | What It Is | Why It Matters |
|--------|-----------|----------------|
| **Convergence Scoring** | Multi-source synthesis across whale, dev, and fear signals | Catches moves before single-source indicators |
| **Whale Divergence** | Real-time Hyperliquid position tracking | Know when smart money loads while retail sells |
| **Network Intelligence** | Ecosystem development velocity + package adoption scoring | Infrastructure momentum predicts price momentum |
| **Query Surge Intelligence** | What 19K+ daily API consumers are searching for | Developer demand is a leading indicator |
| **Predictive Signals** | DeepSeek-synthesized signals with entry price logging | Every prediction verified at 24h/72h/7d |
| **Risk Radar** | Composite scoring: funding + liquidations + fear + flows | One number for the market regime |

---

## Try It (30 seconds)

```bash
# See what we track (free, 3 requests/day)
curl https://api.botindex.dev/api/botindex/zora/trending-coins

# See what we know (Pro, $9.99/mo)
curl -H "X-API-Key: YOUR_KEY" \
  https://api.botindex.dev/api/botindex/synthesis/smart-money-flow

# See what's next (Sentinel, $49.99/mo)
curl -H "X-API-Key: YOUR_SENTINEL_KEY" \
  https://api.botindex.dev/api/botindex/sentinel/signals
```

---

## Pricing

| Tier | Price | What You Get |
|------|-------|-------------|
| **Explorer** | Free | 3 req/day. Raw data only. Truncated results. |
| **Pro Intelligence** | $9.99/mo | 500 req/day. Smart Money Flow, Risk Radar, convergence scoring, Network Intelligence. Full data. |
| **Sentinel** | $49.99/mo | Unlimited. Predictive signals with verifiable accuracy. Query surge intelligence. Personal Telegram alerts. |

```bash
# Get a free key
curl "https://api.botindex.dev/api/botindex/keys/register?plan=free"

# Get Pro
curl "https://api.botindex.dev/api/botindex/keys/register?plan=pro"

# Get Sentinel
curl "https://api.botindex.dev/api/botindex/keys/register?plan=sentinel"
```

---

## Verifiable Track Record

Every prediction is logged with a timestamped entry price. Resolutions checked at 24h, 72h, and 7 days. No cherrypicking. No hindsight.

**→ [View live track record](https://api.botindex.dev/api/botindex/sentinel/track-record)**

---

## Intelligence Endpoints

### Pro ($9.99/mo)

| Endpoint | Description |
|----------|-------------|
| `GET /synthesis/smart-money-flow` | Whale accumulation + funding rate convergence |
| `GET /synthesis/risk-radar` | Composite market risk score with DeepSeek synthesis |
| `GET /sentinel/network-intelligence/rankings` | Ecosystem momentum scores (8 ecosystems) |
| `GET /sentinel/query-intelligence` | What API consumers are searching for (teaser) |

### Sentinel ($49.99/mo)

| Endpoint | Description |
|----------|-------------|
| `GET /sentinel/signals` | Full predictive signal report with narratives |
| `GET /sentinel/track-record` | Prediction accuracy stats (public) |
| `GET /sentinel/query-intelligence` | Full endpoint-level query intelligence |
| `GET /sentinel/network-intelligence` | Detailed ecosystem scoring with components |

### Free (3/day, raw data)

| Endpoint | Description |
|----------|-------------|
| `GET /zora/trending-coins` | Zora trending coins |
| `GET /hyperliquid/whale-alerts` | Whale position alerts |
| `GET /hyperliquid/funding-arb` | Funding rate arbitrage |
| `GET /hyperliquid/correlation-matrix` | Token correlation matrix |
| `GET /sentinel/status` | Current alert level (teaser) |

All endpoints prefixed with `/api/botindex/`.

---

## For AI Agents (MCP)

```json
{
  "mcpServers": {
    "botindex": {
      "command": "npx",
      "args": ["-y", "botindex-mcp"],
      "env": { "BOTINDEX_API_KEY": "your_key" }
    }
  }
}
```

---

## Coverage

**16 assets under divergence monitoring:**
BTC, ETH, SOL, KAS, STX, ORDI, BABY, HYPE, PURR, ZORA, AAVE, UNI, LINK, ARB, OP, POL

**8 ecosystem momentum scores:**
Ethereum, Solana, Uniswap, Hyperliquid, Base, Aave, Zora, Pump.fun

**Signal refresh:** Every 15 minutes. Divergence scan every 30 minutes.

---

## Links

- **Landing:** [botindex.dev](https://botindex.dev)
- **Track Record:** [api.botindex.dev/api/botindex/sentinel/track-record](https://api.botindex.dev/api/botindex/sentinel/track-record)
- **MCP Server:** [npmjs.com/package/botindex-mcp-server](https://npmjs.com/package/botindex-mcp-server)
- **AAR Trust Layer:** [aar.botindex.dev](https://aar.botindex.dev)

---

## License

MIT

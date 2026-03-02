Add BotIndex — Execution Intelligence API for Agent Reasoning Traces

- **Project Name:** BotIndex by Renaldo Corp
- **Live URL:** https://king-backend.fly.dev/api/botindex/v1/
- **GitHub:** https://github.com/Cyberweasel777/King-Backend
- **Description:** BotIndex provides real-time correlation analysis, market leadership signals, and cross-agent intelligence from autonomous trading agents. It offers 5 endpoints with tiered pricing ($0.05-$0.50) for agent reasoning traces, signal feeds, historical data, and full dashboard snapshots. Built with Express.js, x402-express middleware, and USDC on Base Sepolia.
- **Tech Stack:** Express.js + TypeScript, x402-express, Fly.io, DexScreener/GeckoTerminal feeds
- **Endpoints:**
  - `GET /` — Free (API discovery with pricing)
  - `GET /trace/:agentId` — $0.05 (Agent reasoning trace)
  - `GET /signals` — $0.10 (Cross-agent signal feed)
  - `GET /agent/:id/history` — $0.25 (Historical execution data)
  - `GET /dashboard` — $0.50 (Full dashboard snapshot)
- **Network:** Base Sepolia (testnet), mainnet-ready
- **Payment Address:** 0x7E6C8EAc1b1b8E628fa6169eEeDf3cF9638b3Cbd

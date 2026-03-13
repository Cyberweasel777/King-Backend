/**
 * /.well-known/ai-plugin.json — Standard agent discovery endpoint
 * /.well-known/mcp.json — MCP server manifest for Claude/Cursor ecosystem
 *
 * These are the two primary ways AI agents discover API services.
 */

import { Request, Response, Router } from 'express';

const router = Router();

const BASE_URL = process.env.BASE_URL || 'https://king-backend.fly.dev';

// ============================================================
// AI Plugin Manifest (ChatGPT / ACP / agent crawlers)
// ============================================================
router.get('/ai-plugin.json', (_req: Request, res: Response) => {
  res.json({
    schema_version: 'v1',
    name_for_human: 'BotIndex',
    name_for_model: 'botindex',
    description_for_human: 'AI-native signal intelligence API. Sports odds, crypto correlations, token graduations, and agentic commerce comparison — all x402-gated.',
    description_for_model: 'BotIndex is a multi-vertical signal intelligence API designed for AI agents. It provides real-time sports betting odds, player correlations, DFS optimization, crypto token correlation matrices, token graduation signals from Catapult (Hyperliquid) and Metaplex Genesis (Solana), and cross-protocol agentic commerce comparison (ACP vs UCP vs x402). All endpoints require x402 payment (USDC on Base). No API keys, no signup — wallet is identity, payment is auth. Discovery endpoint at /api/botindex/v1/ is free.',
    auth: {
      type: 'x402',
      protocol: 'HTTP 402 Payment Required',
      currency: 'USDC',
      network: 'Base',
      facilitator: 'https://facilitator.x402.org',
      wallet: '0x7E6C8EAc1b1b8E628fa6169eEeDf3cF9638b3Cbd',
      instructions: 'Send x402-compatible payment header with each request. On 402 response, the body contains payment requirements including exact amount, recipient wallet, and network. Use @x402/client SDK or construct payment manually.',
    },
    api: {
      type: 'openapi',
      url: `${BASE_URL}/api/botindex/v1/openapi.json`,
      is_user_authenticated: false,
    },
    logo_url: `${BASE_URL}/api/botindex/v1/logo.png`,
    contact_email: 'api@botindex.dev',
    legal_info_url: `${BASE_URL}/api/botindex/v1/terms`,
    endpoints: {
      discovery: {
        url: `${BASE_URL}/api/botindex/v1/`,
        method: 'GET',
        price: 'FREE',
        description: 'Full endpoint catalog with pricing and descriptions',
      },
      sports: {
        base: `${BASE_URL}/api/botindex/v1/sports`,
        endpoints: [
          { path: '/odds', price: '$0.02', description: 'Live sports odds (NFL, NBA, UFC, NHL)' },
          { path: '/lines', price: '$0.02', description: 'Line movements with sharp action flags' },
          { path: '/props', price: '$0.02', description: 'Prop bet movements with confidence' },
          { path: '/correlations', price: '$0.05', description: 'Player correlation matrix for DFS' },
          { path: '/optimizer', price: '$0.10', description: 'Correlation-adjusted DFS lineup optimizer' },
          { path: '/arb', price: '$0.05', description: 'Cross-platform arbitrage scanner' },
        ],
      },
      crypto: {
        base: `${BASE_URL}/api/botindex/v1/crypto`,
        endpoints: [
          { path: '/tokens', price: '$0.02', description: 'Token universe with price data' },
          { path: '/graduating', price: '$0.02', description: 'Catapult→Hyperliquid graduation signals' },
        ],
      },
      solana: {
        base: `${BASE_URL}/api/botindex/v1/solana`,
        endpoints: [
          { path: '/launches', price: '$0.02', description: 'Metaplex Genesis launches' },
          { path: '/active', price: '$0.02', description: 'Active Genesis launches only' },
        ],
      },
      commerce: {
        base: `${BASE_URL}/api/botindex/v1/commerce`,
        endpoints: [
          { path: '/compare?q=<query>', price: '$0.05', description: 'Cross-protocol merchant comparison (ACP/UCP/x402)' },
          { path: '/protocols', price: '$0.01', description: 'Protocol directory with fees' },
        ],
      },
      premium: {
        base: `${BASE_URL}/api/botindex/v1`,
        endpoints: [
          { path: '/trace/:agentId', price: '$0.05', description: 'Agent reasoning trace' },
          { path: '/signals', price: '$0.10', description: 'Aggregated signals feed' },
          { path: '/agent/:id/history', price: '$0.25', description: 'Historical analysis' },
          { path: '/dashboard', price: '$0.50', description: 'Full premium dashboard' },
        ],
      },
    },
    capabilities: [
      'sports_betting_intelligence',
      'crypto_correlation_analysis',
      'token_graduation_monitoring',
      'dfs_lineup_optimization',
      'arbitrage_detection',
      'agentic_commerce_comparison',
      'multi_chain_monitoring',
    ],
    supported_protocols: ['x402', 'acp', 'ucp'],
    pricing_model: 'per_request',
    currency: 'USDC',
    min_price: '$0.01',
    max_price: '$0.50',
  });
});

// ============================================================
// MCP Server Manifest (Claude / Cursor / MCP-compatible agents)
// ============================================================
router.get('/mcp.json', (_req: Request, res: Response) => {
  res.json({
    schema_version: '2025-03-26',
    name: 'botindex',
    description: 'BotIndex: AI-native signal intelligence API with x402 payment gating. Sports odds, crypto correlations, token graduation monitoring, and agentic commerce comparison across ACP, UCP, and x402 protocols.',
    version: '1.0.0',
    server: {
      transport: 'http',
      url: `${BASE_URL}/api/botindex/v1`,
    },
    auth: {
      type: 'x402',
      description: 'Endpoints return HTTP 402 with payment requirements. Use x402 SDK to construct payment headers.',
      wallet: '0x7E6C8EAc1b1b8E628fa6169eEeDf3cF9638b3Cbd',
      network: 'base',
      currency: 'USDC',
    },
    tools: [
      {
        name: 'botindex_discover',
        description: 'Get the full BotIndex API catalog with all endpoints, pricing, and descriptions. Free — no payment required.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        endpoint: { method: 'GET', path: '/' },
        price: 'free',
      },
      {
        name: 'botindex_sports_odds',
        description: 'Get live sports odds snapshot across NFL, NBA, UFC, NHL. Returns moneyline, spread, and totals with bookmaker comparisons.',
        inputSchema: {
          type: 'object',
          properties: {
            sport: { type: 'string', enum: ['nfl', 'nba', 'ufc', 'nhl'], description: 'Filter by sport' },
          },
          required: [],
        },
        endpoint: { method: 'GET', path: '/sports/odds' },
        price: '$0.02',
      },
      {
        name: 'botindex_sports_lines',
        description: 'Get sports line movements with sharp money action flags. Identifies where professional bettors are moving markets.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        endpoint: { method: 'GET', path: '/sports/lines' },
        price: '$0.02',
      },
      {
        name: 'botindex_sports_props',
        description: 'Get top prop bet movements with confidence scores. Identifies value in player prop markets.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        endpoint: { method: 'GET', path: '/sports/props' },
        price: '$0.02',
      },
      {
        name: 'botindex_sports_correlations',
        description: 'Get player correlation matrix for DFS and correlated betting. Shows which players perform together.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        endpoint: { method: 'GET', path: '/sports/correlations' },
        price: '$0.05',
      },
      {
        name: 'botindex_dfs_optimizer',
        description: 'Run correlation-adjusted DFS lineup optimizer. Returns optimized lineups accounting for player correlations.',
        inputSchema: {
          type: 'object',
          properties: {
            budget: { type: 'number', description: 'Salary cap budget' },
            sport: { type: 'string', description: 'Target sport' },
          },
          required: [],
        },
        endpoint: { method: 'GET', path: '/sports/optimizer' },
        price: '$0.10',
      },
      {
        name: 'botindex_arb_scanner',
        description: 'Scan for cross-platform prediction market and sportsbook arbitrage opportunities.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        endpoint: { method: 'GET', path: '/sports/arb' },
        price: '$0.05',
      },
      {
        name: 'botindex_crypto_tokens',
        description: 'Get token universe with latest price data from MemeRadar correlation engine.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        endpoint: { method: 'GET', path: '/crypto/tokens' },
        price: '$0.02',
      },
      {
        name: 'botindex_crypto_graduating',
        description: 'Get token graduation signals from Catapult launchpad to Hyperliquid mainnet via GradSniper.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        endpoint: { method: 'GET', path: '/crypto/graduating' },
        price: '$0.02',
      },
      {
        name: 'botindex_solana_launches',
        description: 'Get all tracked Metaplex Genesis token launches on Solana mainnet.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        endpoint: { method: 'GET', path: '/solana/launches' },
        price: '$0.02',
      },
      {
        name: 'botindex_solana_active',
        description: 'Get currently active Metaplex Genesis launches on Solana (filtered by status).',
        inputSchema: { type: 'object', properties: {}, required: [] },
        endpoint: { method: 'GET', path: '/solana/active' },
        price: '$0.02',
      },
      {
        name: 'botindex_commerce_compare',
        description: 'Compare merchant offers across agentic commerce protocols (ACP, UCP, x402). Returns ranked offers with trust scores, fees, and checkout protocol details. Use this before executing any purchase to find the best deal.',
        inputSchema: {
          type: 'object',
          properties: {
            q: { type: 'string', description: 'Product search query (e.g. "GPU cloud credits", "market data feed")' },
            maxPrice: { type: 'number', description: 'Maximum price filter' },
            protocol: { type: 'string', enum: ['acp', 'ucp', 'x402'], description: 'Preferred checkout protocol' },
            limit: { type: 'number', description: 'Max results (default 10, max 50)' },
          },
          required: ['q'],
        },
        endpoint: { method: 'GET', path: '/commerce/compare' },
        price: '$0.05',
      },
      {
        name: 'botindex_commerce_protocols',
        description: 'Get directory of agentic commerce protocols (ACP by OpenAI+Stripe, UCP by Google, x402 by Coinbase) with fee structures and merchant counts.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        endpoint: { method: 'GET', path: '/commerce/protocols' },
        price: '$0.01',
      },
      {
        name: 'botindex_signals',
        description: 'Get aggregated premium signals feed combining correlation leaders, prediction arbitrage, and market heatmap.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        endpoint: { method: 'GET', path: '/signals' },
        price: '$0.10',
      },
      {
        name: 'botindex_agent_trace',
        description: 'Get premium reasoning trace for a specific agent (spreadhunter, rosterradar, arbwatch, memeradar, botindex).',
        inputSchema: {
          type: 'object',
          properties: {
            agentId: { type: 'string', enum: ['spreadhunter', 'rosterradar', 'arbwatch', 'memeradar', 'botindex'] },
          },
          required: ['agentId'],
        },
        endpoint: { method: 'GET', path: '/trace/{agentId}' },
        price: '$0.05',
      },
      {
        name: 'botindex_dashboard',
        description: 'Get full premium dashboard payload with all agents, traces, correlation matrices, prediction arb, and heatmaps. Most comprehensive single-call data package.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        endpoint: { method: 'GET', path: '/dashboard' },
        price: '$0.50',
      },
    ],
  });
});

// ============================================================
// Agorion Agent Services Manifest (agent-to-agent discovery)
// ============================================================
router.get('/agent-services.json', (_req: Request, res: Response) => {
  res.json({
    schema_version: '1.0',
    provider: {
      name: 'BotIndex',
      description: 'AI-native signal intelligence API. Crypto market data, whale alerts, prediction market edges, Zora trending coins, Hyperliquid funding arb, and regulatory intelligence. Serves both human developers (API keys) and autonomous agents (x402 micropayments).',
      url: BASE_URL,
      contact: 'api@botindex.dev',
    },
    services: [
      {
        id: 'botindex-crypto',
        name: 'Crypto Intelligence',
        description: 'Token correlations, graduation signals, Zora trending coins, whale alerts, funding arbitrage.',
        capabilities: ['crypto-correlations', 'whale-alerts', 'zora-trending', 'funding-arb', 'token-graduation'],
        endpoints: [
          { path: '/api/botindex/zora/trending-coins', method: 'GET', description: 'Trending Zora coins by volume' },
          { path: '/api/botindex/hyperliquid/funding-arb', method: 'GET', description: 'Hyperliquid funding rate arbitrage' },
          { path: '/api/botindex/hyperliquid/whale-alerts', method: 'GET', description: 'Whale trade alerts >$5k' },
          { path: '/api/botindex/hyperliquid/correlation-matrix', method: 'GET', description: 'Token correlation matrix' },
          { path: '/api/botindex/v1/crypto/tokens', method: 'GET', description: 'Token universe with prices' },
          { path: '/api/botindex/v1/crypto/graduating', method: 'GET', description: 'Catapult→Hyperliquid graduation signals' },
        ],
        pricing: { model: 'x402', currency: 'USDC', network: 'Base', perRequest: '$0.02' },
      },
      {
        id: 'botindex-sports',
        name: 'Sports Intelligence',
        description: 'Live odds, line movements, player correlations, DFS optimization, arbitrage detection.',
        capabilities: ['sports-odds', 'line-movements', 'player-correlations', 'dfs-optimizer', 'arbitrage'],
        endpoints: [
          { path: '/api/botindex/v1/sports/odds', method: 'GET', description: 'Live sports odds' },
          { path: '/api/botindex/v1/sports/correlations', method: 'GET', description: 'Player correlation matrix' },
          { path: '/api/botindex/v1/sports/arb', method: 'GET', description: 'Arbitrage scanner' },
        ],
        pricing: { model: 'x402', currency: 'USDC', network: 'Base', perRequest: '$0.02-$0.10' },
      },
      {
        id: 'botindex-signals',
        name: 'Aggregated Signals',
        description: 'Premium signal feed combining all intelligence sources into ranked actionable alerts.',
        capabilities: ['aggregated-signals', 'market-heatmap', 'agent-traces'],
        endpoints: [
          { path: '/api/botindex/v1/signals', method: 'GET', description: 'Aggregated signals feed' },
          { path: '/api/botindex/v1/dashboard', method: 'GET', description: 'Full premium dashboard' },
        ],
        pricing: { model: 'x402', currency: 'USDC', network: 'Base', perRequest: '$0.10-$0.50' },
      },
      {
        id: 'botindex-mcp',
        name: 'MCP Server',
        description: 'Model Context Protocol server with 29 tools for AI agent integration.',
        capabilities: ['mcp-server', 'tool-calling', 'agent-integration'],
        endpoints: [
          { path: '/mcp', method: 'POST', description: 'MCP Streamable HTTP transport' },
          { path: '/api/botindex/mcp-catalog', method: 'GET', description: 'MCP tool catalog' },
        ],
        pricing: { model: 'freemium', freeCallsPerDay: 5, paidVia: 'api_key' },
      },
      {
        id: 'agorion-registry',
        name: 'Agorion Agent Registry',
        description: 'Auto-discovery registry of 170+ agent service providers with health scores and capability search.',
        capabilities: ['agent-discovery', 'provider-registry', 'health-monitoring'],
        endpoints: [
          { path: '/api/agorion/discover', method: 'GET', description: 'Search providers by capability' },
          { path: '/api/agorion/providers', method: 'GET', description: 'List all providers' },
          { path: '/api/agorion/stats', method: 'GET', description: 'Registry statistics' },
        ],
        pricing: { model: 'free' },
      },
    ],
    auth: {
      methods: [
        { type: 'x402', description: 'Micropayment per request via USDC on Base', wallet: '0x7E6C8EAc1b1b8E628fa6169eEeDf3cF9638b3Cbd' },
        { type: 'api_key', description: 'API key via X-API-Key header', registrationUrl: `${BASE_URL}/api/botindex/keys/register` },
        { type: 'anonymous', description: 'Rate-limited free tier (3 calls/day)' },
      ],
    },
    trust: {
      aar: true,
      receiptHeader: 'X-BotIndex-Receipt',
      publicKeyUrl: `${BASE_URL}/.well-known/receipt-pubkey`,
      spec: 'https://github.com/Cyberweasel777/agent-action-receipt-spec',
    },
    discovery: {
      openapi: `${BASE_URL}/api/botindex/v1/openapi.json`,
      aiPlugin: `${BASE_URL}/.well-known/ai-plugin.json`,
      mcp: `${BASE_URL}/.well-known/mcp.json`,
      mcpTransport: `${BASE_URL}/mcp`,
    },
  });
});

export default router;

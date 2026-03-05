/**
 * MCP Streamable HTTP Transport — mounted at /mcp
 *
 * Exposes all BotIndex tools via the Model Context Protocol
 * using Streamable HTTP transport for Smithery and other MCP clients.
 */

import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

const MCP_SESSION_HEADER = 'mcp-session-id';
const BASE_URL = process.env.BOTINDEX_URL || 'https://king-backend.fly.dev/api/botindex/v1';

interface SessionContext {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
}

const sessions = new Map<string, SessionContext>();

// ── Helpers ──────────────────────────────────────────────────────

async function fetchBotindex(path: string, params?: Record<string, string>): Promise<unknown> {
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v) url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString());

  if (res.status === 402) {
    const body = await res.json();
    return {
      x402_payment_required: true,
      message: 'This endpoint requires x402 payment (USDC on Base). Include x402 payment header.',
      requirements: body,
      endpoint: path,
      wallet: '0x7E6C8EAc1b1b8E628fa6169eEeDf3cF9638b3Cbd',
      network: 'base',
      sdk: 'npm install @x402/client',
    };
  }

  if (!res.ok) {
    return { error: true, status: res.status, message: await res.text() };
  }

  return res.json();
}

function sendJsonRpcError(res: Response, status: number, code: number, message: string): void {
  res.status(status).json({ jsonrpc: '2.0', error: { code, message }, id: null });
}

function getSessionId(req: Request): string | undefined {
  const id = req.header(MCP_SESSION_HEADER);
  return id?.trim() || undefined;
}

// ── Tool Registration ────────────────────────────────────────────

function createServer(): McpServer {
  const server = new McpServer({ name: 'botindex', version: '1.0.4' });

  // Free discovery
  server.tool('botindex_discover', 'Get the full BotIndex API catalog — all endpoints, pricing, descriptions. FREE.', {}, async () => {
    const data = await fetchBotindex('/');
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  });

  // Sports
  server.tool('botindex_sports_odds', 'Live sports odds snapshot (NFL, NBA, UFC, NHL). $0.02', { sport: z.string().optional().describe('Filter: nfl, nba, ufc, nhl') }, async ({ sport }) => {
    const p: Record<string, string> = {}; if (sport) p.sport = sport;
    return { content: [{ type: 'text', text: JSON.stringify(await fetchBotindex('/sports/odds', p), null, 2) }] };
  });

  server.tool('botindex_sports_lines', 'Line movements with sharp money flags. $0.02', {}, async () => {
    return { content: [{ type: 'text', text: JSON.stringify(await fetchBotindex('/sports/lines'), null, 2) }] };
  });

  server.tool('botindex_sports_props', 'Top prop bet movements with confidence scores. $0.02', {}, async () => {
    return { content: [{ type: 'text', text: JSON.stringify(await fetchBotindex('/sports/props'), null, 2) }] };
  });

  server.tool('botindex_sports_correlations', 'Player correlation matrix for DFS. $0.05', {}, async () => {
    return { content: [{ type: 'text', text: JSON.stringify(await fetchBotindex('/sports/correlations'), null, 2) }] };
  });

  server.tool('botindex_dfs_optimizer', 'Correlation-adjusted DFS lineup optimizer. $0.10', {
    budget: z.number().optional().describe('Salary cap budget'),
    sport: z.string().optional().describe('Target sport'),
  }, async ({ budget, sport }) => {
    const p: Record<string, string> = {};
    if (budget) p.budget = String(budget); if (sport) p.sport = sport;
    return { content: [{ type: 'text', text: JSON.stringify(await fetchBotindex('/sports/optimizer', p), null, 2) }] };
  });

  server.tool('botindex_arb_scanner', 'Cross-platform prediction market and sportsbook arbitrage scanner. $0.05', {}, async () => {
    return { content: [{ type: 'text', text: JSON.stringify(await fetchBotindex('/sports/arb'), null, 2) }] };
  });

  // Crypto
  server.tool('botindex_crypto_tokens', 'Token universe with latest price data. $0.02', {}, async () => {
    return { content: [{ type: 'text', text: JSON.stringify(await fetchBotindex('/crypto/tokens'), null, 2) }] };
  });

  server.tool('botindex_crypto_graduating', 'Token graduation signals from Catapult to Hyperliquid. $0.02', {}, async () => {
    return { content: [{ type: 'text', text: JSON.stringify(await fetchBotindex('/crypto/graduating'), null, 2) }] };
  });

  // Solana
  server.tool('botindex_solana_launches', 'All tracked Metaplex Genesis token launches on Solana. $0.02', {}, async () => {
    return { content: [{ type: 'text', text: JSON.stringify(await fetchBotindex('/solana/launches'), null, 2) }] };
  });

  server.tool('botindex_solana_active', 'Currently active Metaplex Genesis launches. $0.02', {}, async () => {
    return { content: [{ type: 'text', text: JSON.stringify(await fetchBotindex('/solana/active'), null, 2) }] };
  });

  // Commerce
  server.tool('botindex_commerce_compare', 'Compare merchant offers across agentic commerce protocols. $0.05', {
    q: z.string().describe('Product search query'),
    maxPrice: z.number().optional(),
    protocol: z.enum(['acp', 'ucp', 'x402']).optional(),
    limit: z.number().optional(),
  }, async ({ q, maxPrice, protocol, limit }) => {
    const p: Record<string, string> = { q };
    if (maxPrice) p.maxPrice = String(maxPrice);
    if (protocol) p.protocol = protocol;
    if (limit) p.limit = String(limit);
    return { content: [{ type: 'text', text: JSON.stringify(await fetchBotindex('/commerce/compare', p), null, 2) }] };
  });

  server.tool('botindex_commerce_protocols', 'Directory of agentic commerce protocols — ACP, UCP, x402. $0.01', {}, async () => {
    return { content: [{ type: 'text', text: JSON.stringify(await fetchBotindex('/commerce/protocols'), null, 2) }] };
  });

  // Premium
  server.tool('botindex_signals', 'Aggregated premium signals: correlation leaders + prediction arb + heatmap. $0.10', {}, async () => {
    return { content: [{ type: 'text', text: JSON.stringify(await fetchBotindex('/signals'), null, 2) }] };
  });

  server.tool('botindex_agent_trace', 'Premium reasoning trace for a specific agent. $0.05', {
    agentId: z.enum(['spreadhunter', 'rosterradar', 'arbwatch', 'memeradar', 'botindex']).describe('Agent ID'),
  }, async ({ agentId }) => {
    return { content: [{ type: 'text', text: JSON.stringify(await fetchBotindex(`/trace/${agentId}`), null, 2) }] };
  });

  server.tool('botindex_dashboard', 'Full premium dashboard — all agents, traces, matrices. $0.50', {}, async () => {
    return { content: [{ type: 'text', text: JSON.stringify(await fetchBotindex('/dashboard'), null, 2) }] };
  });

  // Zora
  server.tool('botindex_zora_trending_coins', 'Trending Zora attention market coins by volume velocity. $0.03', {
    limit: z.number().optional(),
  }, async ({ limit }) => {
    const p: Record<string, string> = {}; if (limit) p.limit = String(limit);
    return { content: [{ type: 'text', text: JSON.stringify(await fetchBotindex('/zora/trending-coins', p), null, 2) }] };
  });

  server.tool('botindex_zora_creator_scores', 'Creator performance scores on Zora. $0.03', {
    limit: z.number().optional(),
  }, async ({ limit }) => {
    const p: Record<string, string> = {}; if (limit) p.limit = String(limit);
    return { content: [{ type: 'text', text: JSON.stringify(await fetchBotindex('/zora/creator-scores', p), null, 2) }] };
  });

  server.tool('botindex_zora_attention_momentum', 'Attention momentum — which Zora trends are accelerating. $0.03', {
    limit: z.number().optional(),
  }, async ({ limit }) => {
    const p: Record<string, string> = {}; if (limit) p.limit = String(limit);
    return { content: [{ type: 'text', text: JSON.stringify(await fetchBotindex('/zora/attention-momentum', p), null, 2) }] };
  });

  // Hyperliquid
  server.tool('botindex_hl_funding_arb', 'Funding rate arb opportunities between Hyperliquid and CEXs. $0.05', {}, async () => {
    return { content: [{ type: 'text', text: JSON.stringify(await fetchBotindex('/hyperliquid/funding-arb'), null, 2) }] };
  });

  server.tool('botindex_hl_correlation_matrix', 'Hyperliquid perpetual correlation matrix. $0.05', {}, async () => {
    return { content: [{ type: 'text', text: JSON.stringify(await fetchBotindex('/hyperliquid/correlation-matrix'), null, 2) }] };
  });

  server.tool('botindex_hl_liquidation_heatmap', 'Liquidation cluster heatmap by price level. $0.05', {}, async () => {
    return { content: [{ type: 'text', text: JSON.stringify(await fetchBotindex('/hyperliquid/liquidation-heatmap'), null, 2) }] };
  });

  server.tool('botindex_hl_coin_analytics', 'Deep analytics for a specific Hyperliquid coin. $0.05', {
    address: z.string().describe('Coin address or symbol'),
  }, async ({ address }) => {
    return { content: [{ type: 'text', text: JSON.stringify(await fetchBotindex(`/hyperliquid/coin-analytics?address=${encodeURIComponent(address)}`), null, 2) }] };
  });

  return server;
}

// ── Router ────────────────────────────────────────────────────────

const mcpRouter = Router();

// Use raw JSON body (already parsed by express.json() upstream, but MCP SDK needs the raw object)
mcpRouter.post('/', async (req: Request, res: Response) => {
  try {
    const sessionId = getSessionId(req);

    if (sessionId) {
      const session = sessions.get(sessionId);
      if (!session) {
        sendJsonRpcError(res, 404, -32001, 'Session not found');
        return;
      }
      await session.transport.handleRequest(req, res, req.body);
      return;
    }

    // New session
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        sessions.set(id, { server, transport });
      },
      onsessionclosed: (id) => {
        const s = sessions.get(id);
        sessions.delete(id);
        if (s) void s.server.close().catch(() => undefined);
      },
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);

    if (!transport.sessionId) {
      await server.close();
    }
  } catch (err) {
    console.error('MCP POST error:', err);
    if (!res.headersSent) sendJsonRpcError(res, 500, -32603, 'Internal server error');
  }
});

const handleSessionReq = async (req: Request, res: Response): Promise<void> => {
  const sessionId = getSessionId(req);
  if (!sessionId) {
    sendJsonRpcError(res, 400, -32000, 'Mcp-Session-Id header required');
    return;
  }
  const session = sessions.get(sessionId);
  if (!session) {
    sendJsonRpcError(res, 404, -32001, 'Session not found');
    return;
  }
  await session.transport.handleRequest(req, res);
  if (req.method === 'DELETE') {
    sessions.delete(sessionId);
    await session.server.close().catch(() => undefined);
  }
};

mcpRouter.get('/', async (req: Request, res: Response) => {
  try { await handleSessionReq(req, res); } catch (err) {
    console.error('MCP GET error:', err);
    if (!res.headersSent) sendJsonRpcError(res, 500, -32603, 'Internal server error');
  }
});

mcpRouter.delete('/', async (req: Request, res: Response) => {
  try { await handleSessionReq(req, res); } catch (err) {
    console.error('MCP DELETE error:', err);
    if (!res.headersSent) sendJsonRpcError(res, 500, -32603, 'Internal server error');
  }
});

export default mcpRouter;

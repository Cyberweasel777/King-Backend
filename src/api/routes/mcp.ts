/**
 * MCP Streamable HTTP Transport — mounted at /mcp
 *
 * Uses dynamic import() to load ESM-only @modelcontextprotocol/sdk
 * from this CommonJS project.
 */

import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const MCP_SESSION_HEADER = 'mcp-session-id';
const BASE_URL = process.env.BOTINDEX_URL || 'https://king-backend.fly.dev/api/botindex/v1';

const mcpRouter = Router();

// Lazy-loaded MCP SDK references
let McpServer: any;
let StreamableHTTPServerTransport: any;
let sdkLoaded = false;

const sessions = new Map<string, { server: any; transport: any }>();

async function loadSdk(): Promise<boolean> {
  if (sdkLoaded) return true;
  try {
    const mcpMod = await import('@modelcontextprotocol/sdk/server/mcp.js');
    const httpMod = await import('@modelcontextprotocol/sdk/server/streamableHttp.js');
    McpServer = mcpMod.McpServer;
    StreamableHTTPServerTransport = httpMod.StreamableHTTPServerTransport;
    sdkLoaded = true;
    return true;
  } catch (err) {
    console.error('Failed to load MCP SDK:', err);
    return false;
  }
}

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
      message: 'This endpoint requires x402 payment (USDC on Base).',
      requirements: body,
      wallet: '0x7E6C8EAc1b1b8E628fa6169eEeDf3cF9638b3Cbd',
      network: 'base',
    };
  }
  if (!res.ok) return { error: true, status: res.status, message: await res.text() };
  return res.json();
}

function sendErr(res: Response, status: number, code: number, msg: string): void {
  res.status(status).json({ jsonrpc: '2.0', error: { code, message: msg }, id: null });
}

function getSessionId(req: Request): string | undefined {
  const id = req.header(MCP_SESSION_HEADER);
  return id?.trim() || undefined;
}

function createServer(): any {
  const server = new McpServer({ name: 'botindex', version: '1.0.4' });

  const tool = (name: string, desc: string, schema: any, fn: (args: any) => Promise<unknown>) => {
    server.tool(name, desc, schema, async (args: any) => {
      const data = await fn(args);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    });
  };

  // Free
  tool('botindex_discover', 'Full BotIndex API catalog. FREE.', {}, () => fetchBotindex('/'));

  // Sports
  tool('botindex_sports_odds', 'Live sports odds (NFL, NBA, UFC, NHL). $0.02', { sport: z.string().optional() }, ({ sport }: any) => {
    const p: any = {}; if (sport) p.sport = sport; return fetchBotindex('/sports/odds', p);
  });
  tool('botindex_sports_lines', 'Line movements with sharp money flags. $0.02', {}, () => fetchBotindex('/sports/lines'));
  tool('botindex_sports_props', 'Prop bet movements. $0.02', {}, () => fetchBotindex('/sports/props'));
  tool('botindex_sports_correlations', 'Player correlation matrix for DFS. $0.05', {}, () => fetchBotindex('/sports/correlations'));
  tool('botindex_dfs_optimizer', 'DFS lineup optimizer. $0.10', { budget: z.number().optional(), sport: z.string().optional() }, ({ budget, sport }: any) => {
    const p: any = {}; if (budget) p.budget = String(budget); if (sport) p.sport = sport; return fetchBotindex('/sports/optimizer', p);
  });
  tool('botindex_arb_scanner', 'Cross-platform arb scanner. $0.05', {}, () => fetchBotindex('/sports/arb'));

  // Crypto
  tool('botindex_crypto_tokens', 'Token universe with prices. $0.02', {}, () => fetchBotindex('/crypto/tokens'));
  tool('botindex_crypto_graduating', 'Token graduation signals. $0.02', {}, () => fetchBotindex('/crypto/graduating'));

  // Solana
  tool('botindex_solana_launches', 'Metaplex Genesis launches. $0.02', {}, () => fetchBotindex('/solana/launches'));
  tool('botindex_solana_active', 'Active Genesis launches. $0.02', {}, () => fetchBotindex('/solana/active'));

  // Commerce
  tool('botindex_commerce_compare', 'Compare agentic commerce offers. $0.05', {
    q: z.string(), maxPrice: z.number().optional(), protocol: z.enum(['acp', 'ucp', 'x402']).optional(), limit: z.number().optional(),
  }, ({ q, maxPrice, protocol, limit }: any) => {
    const p: any = { q }; if (maxPrice) p.maxPrice = String(maxPrice); if (protocol) p.protocol = protocol; if (limit) p.limit = String(limit);
    return fetchBotindex('/commerce/compare', p);
  });
  tool('botindex_commerce_protocols', 'Agentic commerce protocol directory. $0.01', {}, () => fetchBotindex('/commerce/protocols'));

  // Premium
  tool('botindex_signals', 'Aggregated premium signals. $0.10', {}, () => fetchBotindex('/signals'));
  tool('botindex_agent_trace', 'Agent reasoning trace. $0.05', {
    agentId: z.enum(['spreadhunter', 'rosterradar', 'arbwatch', 'memeradar', 'botindex']),
  }, ({ agentId }: any) => fetchBotindex(`/trace/${agentId}`));
  tool('botindex_dashboard', 'Full premium dashboard. $0.50', {}, () => fetchBotindex('/dashboard'));

  // Zora
  tool('botindex_zora_trending_coins', 'Trending Zora coins. $0.03', { limit: z.number().optional() }, ({ limit }: any) => {
    const p: any = {}; if (limit) p.limit = String(limit); return fetchBotindex('/zora/trending-coins', p);
  });
  tool('botindex_zora_creator_scores', 'Zora creator scores. $0.03', { limit: z.number().optional() }, ({ limit }: any) => {
    const p: any = {}; if (limit) p.limit = String(limit); return fetchBotindex('/zora/creator-scores', p);
  });
  tool('botindex_zora_attention_momentum', 'Zora attention momentum. $0.03', { limit: z.number().optional() }, ({ limit }: any) => {
    const p: any = {}; if (limit) p.limit = String(limit); return fetchBotindex('/zora/attention-momentum', p);
  });

  // Hyperliquid
  tool('botindex_hl_funding_arb', 'HL funding rate arb. $0.05', {}, () => fetchBotindex('/hyperliquid/funding-arb'));
  tool('botindex_hl_correlation_matrix', 'HL perp correlation matrix. $0.05', {}, () => fetchBotindex('/hyperliquid/correlation-matrix'));
  tool('botindex_hl_liquidation_heatmap', 'HL liquidation heatmap. $0.05', {}, () => fetchBotindex('/hyperliquid/liquidation-heatmap'));
  tool('botindex_hl_coin_analytics', 'Deep HL coin analytics. $0.05', { address: z.string() }, ({ address }: any) =>
    fetchBotindex(`/hyperliquid/coin-analytics?address=${encodeURIComponent(address)}`));

  return server;
}

// ── Routes ────────────────────────────────────────────────────────

mcpRouter.post('/', async (req: Request, res: Response) => {
  if (!await loadSdk()) { sendErr(res, 503, -32603, 'MCP SDK unavailable'); return; }
  try {
    const sessionId = getSessionId(req);
    if (sessionId) {
      const s = sessions.get(sessionId);
      if (!s) { sendErr(res, 404, -32001, 'Session not found'); return; }
      await s.transport.handleRequest(req, res, req.body);
      return;
    }
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id: string) => { sessions.set(id, { server, transport }); },
      onsessionclosed: (id: string) => { const s = sessions.get(id); sessions.delete(id); if (s) void s.server.close().catch(() => {}); },
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    if (!transport.sessionId) await server.close();
  } catch (err) {
    console.error('MCP POST error:', err);
    if (!res.headersSent) sendErr(res, 500, -32603, 'Internal server error');
  }
});

const handleSession = async (req: Request, res: Response): Promise<void> => {
  if (!await loadSdk()) { sendErr(res, 503, -32603, 'MCP SDK unavailable'); return; }
  const sessionId = getSessionId(req);
  if (!sessionId) { sendErr(res, 400, -32000, 'Mcp-Session-Id header required'); return; }
  const s = sessions.get(sessionId);
  if (!s) { sendErr(res, 404, -32001, 'Session not found'); return; }
  await s.transport.handleRequest(req, res);
  if (req.method === 'DELETE') { sessions.delete(sessionId); await s.server.close().catch(() => {}); }
};

mcpRouter.get('/', async (req: Request, res: Response) => {
  try { await handleSession(req, res); } catch (err) { console.error('MCP GET error:', err); if (!res.headersSent) sendErr(res, 500, -32603, 'Internal error'); }
});

mcpRouter.delete('/', async (req: Request, res: Response) => {
  try { await handleSession(req, res); } catch (err) { console.error('MCP DELETE error:', err); if (!res.headersSent) sendErr(res, 500, -32603, 'Internal error'); }
});

export default mcpRouter;

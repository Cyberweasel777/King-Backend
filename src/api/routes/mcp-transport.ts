/**
 * MCP Streamable HTTP Transport for BotIndex.
 *
 * Exposes all BotIndex MCP tools via Streamable HTTP at /api/botindex/mcp.
 * This enables Smithery and other remote MCP clients to connect directly
 * without requiring npx/stdio.
 */

import { Router, Request, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import logger from '../../config/logger';

const BASE_URL = process.env.BOTINDEX_BASE_URL || 'https://king-backend.fly.dev';

async function fetchBotindex(path: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(`/api/botindex${path}`, BASE_URL);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const response = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`BotIndex API ${response.status}: ${text.slice(0, 200)}`);
  }
  return response.json();
}

function ok(data: any) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function createBotIndexMcpServer(): McpServer {
  const server = new McpServer({
    name: 'botindex-mcp-server',
    version: '1.4.0',
  });

  // Use server.server to register tools at the low-level to avoid TS deep inference issues
  const s = server.server;

  s.setRequestHandler({ method: 'tools/list' } as any, async () => ({
    tools: [
      { name: 'botindex_discover', description: 'List all available BotIndex tools and endpoints with pricing.', inputSchema: { type: 'object', properties: {} } },
      { name: 'botindex_hl_funding_arb', description: 'Get Hyperliquid funding rate arbitrage opportunities ranked by annualized yield. FREE', inputSchema: { type: 'object', properties: {} } },
      { name: 'botindex_signals', description: 'Get latest cross-market signals with bot attribution and confidence scores. FREE', inputSchema: { type: 'object', properties: { limit: { type: 'number', description: 'Max results (default 10)' } } } },
      { name: 'botindex_crypto_tokens', description: 'Get token universe with prices, volumes, and market caps. FREE', inputSchema: { type: 'object', properties: {} } },
      { name: 'botindex_correlation_leaders', description: 'Get top correlated and anti-correlated crypto pairs. $0.02', inputSchema: { type: 'object', properties: {} } },
      { name: 'botindex_zora_trending_coins', description: 'Get trending Zora coins ranked by 24h volume. FREE', inputSchema: { type: 'object', properties: { limit: { type: 'number', description: 'Max results' } } } },
      { name: 'botindex_zora_attention_momentum', description: 'Get Zora coins with accelerating attention — velocity scores. $0.02', inputSchema: { type: 'object', properties: { limit: { type: 'number' } } } },
      { name: 'botindex_zora_creator_scores', description: 'Get top Zora creators scored by market cap, volume, holders. $0.02', inputSchema: { type: 'object', properties: { limit: { type: 'number' } } } },
      { name: 'botindex_doppler_launches', description: 'Get recent Doppler token launches on Base. $0.01', inputSchema: { type: 'object', properties: { limit: { type: 'number' } } } },
      { name: 'botindex_zora_intel', description: 'AI-powered Zora market intelligence — risk scores, fair value, BUY/WATCH/FADE. $0.05', inputSchema: { type: 'object', properties: {} } },
      { name: 'botindex_hyperliquid_intel', description: 'AI-powered funding rate intelligence — rate persistence, entry timing. $0.05', inputSchema: { type: 'object', properties: {} } },
      { name: 'botindex_crypto_intel', description: 'AI-powered crypto correlation intelligence — regime detection, alpha signals. $0.05', inputSchema: { type: 'object', properties: {} } },
      { name: 'botindex_doppler_intel', description: 'AI-powered Doppler launch intelligence — quality scores, rug probability. $0.05', inputSchema: { type: 'object', properties: {} } },
    ],
  }));

  s.setRequestHandler({ method: 'tools/call' } as any, async (request: any) => {
    const { name, arguments: args } = request.params;
    const limit = args?.limit ? String(args.limit) : undefined;
    const params: Record<string, string> = {};
    if (limit) params.limit = limit;

    try {
      let data: any;
      switch (name) {
        case 'botindex_discover': data = await fetchBotindex('/v1/'); break;
        case 'botindex_hl_funding_arb': data = await fetchBotindex('/hyperliquid/funding-arb'); break;
        case 'botindex_signals': data = await fetchBotindex('/v1/signals', params); break;
        case 'botindex_crypto_tokens': data = await fetchBotindex('/v1/crypto/tokens'); break;
        case 'botindex_correlation_leaders': data = await fetchBotindex('/x402/correlation-leaders'); break;
        case 'botindex_zora_trending_coins': data = await fetchBotindex('/zora/trending-coins', params); break;
        case 'botindex_zora_attention_momentum': data = await fetchBotindex('/v1/zora/attention-momentum', params); break;
        case 'botindex_zora_creator_scores': data = await fetchBotindex('/v1/zora/creator-scores', params); break;
        case 'botindex_doppler_launches': data = await fetchBotindex('/doppler/launches', params); break;
        case 'botindex_zora_intel': data = await fetchBotindex('/zora/intel'); break;
        case 'botindex_hyperliquid_intel': data = await fetchBotindex('/hyperliquid/intel'); break;
        case 'botindex_crypto_intel': data = await fetchBotindex('/crypto/intel'); break;
        case 'botindex_doppler_intel': data = await fetchBotindex('/doppler/intel'); break;
        default: return { content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }], isError: true };
      }
      return ok(data);
    } catch (error: any) {
      return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true };
    }
  });

  return server;
}

const router = Router();

const transports = new Map<string, StreamableHTTPServerTransport>();

router.post('/mcp', async (req: Request, res: Response) => {
  try {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (sessionId && transports.has(sessionId)) {
      const transport = transports.get(sessionId)!;
      await transport.handleRequest(req, res, req.body);
      return;
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => `botindex-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    });

    transport.onclose = () => {
      const sid = (transport as any).sessionId;
      if (sid) transports.delete(sid);
    };

    const server = createBotIndexMcpServer();
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);

    const newSessionId = (transport as any).sessionId;
    if (newSessionId) {
      transports.set(newSessionId, transport);
      logger.info({ sessionId: newSessionId }, 'New MCP session created');
    }
  } catch (error) {
    logger.error({ err: error }, 'MCP transport error');
    if (!res.headersSent) {
      res.status(500).json({ error: 'MCP transport error' });
    }
  }
});

router.get('/mcp', async (req: Request, res: Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !transports.has(sessionId)) {
    res.status(400).json({ error: 'Invalid or missing session ID' });
    return;
  }
  const transport = transports.get(sessionId)!;
  await transport.handleRequest(req, res);
});

router.delete('/mcp', async (req: Request, res: Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (sessionId && transports.has(sessionId)) {
    const transport = transports.get(sessionId)!;
    await transport.close();
    transports.delete(sessionId);
    res.json({ message: 'Session closed' });
  } else {
    res.status(404).json({ error: 'Session not found' });
  }
});

setInterval(() => {
  if (transports.size > 100) {
    const oldest = Array.from(transports.keys()).slice(0, transports.size - 50);
    for (const id of oldest) {
      transports.get(id)?.close();
      transports.delete(id);
    }
  }
}, 30 * 60 * 1000);

export default router;

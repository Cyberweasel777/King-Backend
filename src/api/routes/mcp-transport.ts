/**
 * MCP Streamable HTTP Transport for BotIndex.
 *
 * Exposes all BotIndex MCP tools via Streamable HTTP at /api/botindex/mcp.
 */

import { Router, Request, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import logger from '../../config/logger';

const BASE_URL = process.env.BOTINDEX_BASE_URL || 'https://king-backend.fly.dev';

async function fetchBotindex(path: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(`/api/botindex${path}`, BASE_URL);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`BotIndex API ${response.status}: ${(await response.text()).slice(0, 200)}`);
  return response.json();
}

type ToolResult = { content: Array<{ type: 'text'; text: string }> };

function ok(data: any): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

async function callTool(path: string, params: Record<string, string> = {}): Promise<ToolResult> {
  const data = await fetchBotindex(path, params);
  return ok(data);
}

// Schema workaround: define all schemas as plain objects to avoid deep TS inference
const emptySchema = {} as const;
const limitSchema = { limit: z.number().optional() };

function createBotIndexMcpServer(): McpServer {
  const server = new McpServer({ name: 'botindex-mcp-server', version: '1.4.0' });

  // @ts-ignore — MCP SDK generic inference too deep for empty schemas
  // @ts-ignore
  server.tool('botindex_discover', 'List all available BotIndex tools and endpoints with pricing.', emptySchema, async () => callTool('/v1/'));

  // @ts-ignore
  // @ts-ignore
  server.tool('botindex_hl_funding_arb', 'Get Hyperliquid funding rate arbitrage opportunities ranked by annualized yield. FREE', emptySchema, async () => callTool('/hyperliquid/funding-arb'));

  // Signals
  // @ts-ignore
  server.tool('botindex_signals', 'Get latest cross-market signals with bot attribution and confidence scores. FREE', limitSchema, async (args: any) => {
    const p: Record<string, string> = {};
    if (args.limit) p.limit = String(args.limit);
    return callTool('/v1/signals', p);
  });

  // Crypto
  // @ts-ignore
  server.tool('botindex_crypto_tokens', 'Get token universe with prices, volumes, and market caps. FREE', emptySchema, async () => callTool('/v1/crypto/tokens'));
  // @ts-ignore
  server.tool('botindex_correlation_leaders', 'Get top correlated and anti-correlated crypto pairs. $0.02', emptySchema, async () => callTool('/x402/correlation-leaders'));

  // Zora
  // @ts-ignore
  server.tool('botindex_zora_trending', 'Get trending Zora coins ranked by 24h volume. FREE', limitSchema, async (args: any) => {
    const p: Record<string, string> = {};
    if (args.limit) p.limit = String(args.limit);
    return callTool('/zora/trending-coins', p);
  });
  // @ts-ignore
  server.tool('botindex_zora_momentum', 'Get Zora coins with accelerating attention velocity. $0.02', limitSchema, async (args: any) => {
    const p: Record<string, string> = {};
    if (args.limit) p.limit = String(args.limit);
    return callTool('/v1/zora/attention-momentum', p);
  });
  // @ts-ignore
  server.tool('botindex_zora_creators', 'Get top Zora creators scored by market cap, volume, holders. $0.02', limitSchema, async (args: any) => {
    const p: Record<string, string> = {};
    if (args.limit) p.limit = String(args.limit);
    return callTool('/v1/zora/creator-scores', p);
  });

  // Doppler
  // @ts-ignore
  server.tool('botindex_doppler_launches', 'Get recent Doppler token launches on Base. $0.01', limitSchema, async (args: any) => {
    const p: Record<string, string> = {};
    if (args.limit) p.limit = String(args.limit);
    return callTool('/doppler/launches', p);
  });

  // Intel (Premium)
  // @ts-ignore
  server.tool('botindex_zora_intel', 'AI Zora market intelligence: risk scores, fair value, creator grades, BUY/WATCH/FADE. $0.05', emptySchema, async () => callTool('/zora/intel'));
  // @ts-ignore
  server.tool('botindex_hl_intel', 'AI funding rate intelligence: rate persistence, entry timing, risk-adjusted yield. $0.05', emptySchema, async () => callTool('/hyperliquid/intel'));
  // @ts-ignore
  server.tool('botindex_crypto_intel', 'AI crypto correlation intelligence: regime detection, alpha signals, portfolio risk. $0.05', emptySchema, async () => callTool('/crypto/intel'));
  // @ts-ignore
  server.tool('botindex_doppler_intel', 'AI Doppler launch intelligence: quality scores, rug probability, creator analysis. $0.05', emptySchema, async () => callTool('/doppler/intel'));

  return server;
}

const router = Router();
const transports = new Map<string, StreamableHTTPServerTransport>();

router.post('/mcp', async (req: Request, res: Response) => {
  try {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (sessionId && transports.has(sessionId)) {
      await transports.get(sessionId)!.handleRequest(req, res, req.body);
      return;
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => `bi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    });
    transport.onclose = () => {
      const sid = (transport as any).sessionId;
      if (sid) transports.delete(sid);
    };

    const server = createBotIndexMcpServer();
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);

    const sid = (transport as any).sessionId;
    if (sid) {
      transports.set(sid, transport);
      logger.info({ sessionId: sid }, 'MCP session created');
    }
  } catch (error) {
    logger.error({ err: error }, 'MCP transport error');
    if (!res.headersSent) res.status(500).json({ error: 'MCP transport error' });
  }
});

router.get('/mcp', async (req: Request, res: Response) => {
  const sid = req.headers['mcp-session-id'] as string | undefined;
  if (!sid || !transports.has(sid)) { res.status(400).json({ error: 'Invalid session' }); return; }
  await transports.get(sid)!.handleRequest(req, res);
});

router.delete('/mcp', async (req: Request, res: Response) => {
  const sid = req.headers['mcp-session-id'] as string | undefined;
  if (sid && transports.has(sid)) {
    await transports.get(sid)!.close();
    transports.delete(sid);
    res.json({ ok: true });
  } else {
    res.status(404).json({ error: 'Session not found' });
  }
});

setInterval(() => {
  if (transports.size > 100) {
    for (const id of Array.from(transports.keys()).slice(0, transports.size - 50)) {
      transports.get(id)?.close();
      transports.delete(id);
    }
  }
}, 30 * 60 * 1000);

export default router;

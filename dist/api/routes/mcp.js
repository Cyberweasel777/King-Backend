"use strict";
/**
 * MCP Streamable HTTP Transport — mounted at /mcp
 *
 * Uses dynamic import() to load ESM-only @modelcontextprotocol/sdk
 * from this CommonJS project.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const node_crypto_1 = require("node:crypto");
const zod_1 = require("zod");
const MCP_SESSION_HEADER = 'mcp-session-id';
const BASE_URL = process.env.BOTINDEX_URL || 'https://king-backend.fly.dev/api/botindex/v1';
const mcpRouter = (0, express_1.Router)();
// Lazy-loaded MCP SDK references
let McpServer;
let StreamableHTTPServerTransport;
let sdkLoaded = false;
const sessions = new Map();
async function loadSdk() {
    if (sdkLoaded)
        return true;
    try {
        const mcpMod = await Promise.resolve().then(() => __importStar(require('@modelcontextprotocol/sdk/server/mcp.js')));
        const httpMod = await Promise.resolve().then(() => __importStar(require('@modelcontextprotocol/sdk/server/streamableHttp.js')));
        McpServer = mcpMod.McpServer;
        StreamableHTTPServerTransport = httpMod.StreamableHTTPServerTransport;
        sdkLoaded = true;
        return true;
    }
    catch (err) {
        console.error('Failed to load MCP SDK:', err);
        return false;
    }
}
async function fetchBotindex(path, params) {
    const url = new URL(`${BASE_URL}${path}`);
    if (params) {
        for (const [k, v] of Object.entries(params)) {
            if (v)
                url.searchParams.set(k, v);
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
    if (!res.ok)
        return { error: true, status: res.status, message: await res.text() };
    return res.json();
}
function sendErr(res, status, code, msg) {
    res.status(status).json({ jsonrpc: '2.0', error: { code, message: msg }, id: null });
}
function getSessionId(req) {
    const id = req.header(MCP_SESSION_HEADER);
    return id?.trim() || undefined;
}
function createServer() {
    const server = new McpServer({ name: 'botindex', version: '1.0.4' });
    const tool = (name, desc, schema, fn) => {
        server.tool(name, desc, schema, async (args) => {
            const data = await fn(args);
            return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
        });
    };
    // Free
    tool('botindex_discover', 'Full BotIndex API catalog. FREE.', {}, () => fetchBotindex('/'));
    // Sports
    tool('botindex_sports_odds', 'Live sports odds (NFL, NBA, UFC, NHL). $0.02', { sport: zod_1.z.string().optional() }, ({ sport }) => {
        const p = {};
        if (sport)
            p.sport = sport;
        return fetchBotindex('/sports/odds', p);
    });
    tool('botindex_sports_lines', 'Line movements with sharp money flags. $0.02', {}, () => fetchBotindex('/sports/lines'));
    tool('botindex_sports_props', 'Prop bet movements. $0.02', {}, () => fetchBotindex('/sports/props'));
    tool('botindex_sports_correlations', 'Player correlation matrix for DFS. $0.05', {}, () => fetchBotindex('/sports/correlations'));
    tool('botindex_dfs_optimizer', 'DFS lineup optimizer. $0.10', { budget: zod_1.z.number().optional(), sport: zod_1.z.string().optional() }, ({ budget, sport }) => {
        const p = {};
        if (budget)
            p.budget = String(budget);
        if (sport)
            p.sport = sport;
        return fetchBotindex('/sports/optimizer', p);
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
        q: zod_1.z.string(), maxPrice: zod_1.z.number().optional(), protocol: zod_1.z.enum(['acp', 'ucp', 'x402']).optional(), limit: zod_1.z.number().optional(),
    }, ({ q, maxPrice, protocol, limit }) => {
        const p = { q };
        if (maxPrice)
            p.maxPrice = String(maxPrice);
        if (protocol)
            p.protocol = protocol;
        if (limit)
            p.limit = String(limit);
        return fetchBotindex('/commerce/compare', p);
    });
    tool('botindex_commerce_protocols', 'Agentic commerce protocol directory. $0.01', {}, () => fetchBotindex('/commerce/protocols'));
    // Premium
    tool('botindex_signals', 'Aggregated premium signals. $0.10', {}, () => fetchBotindex('/signals'));
    tool('botindex_agent_trace', 'Agent reasoning trace. $0.05', {
        agentId: zod_1.z.enum(['spreadhunter', 'rosterradar', 'arbwatch', 'memeradar', 'botindex']),
    }, ({ agentId }) => fetchBotindex(`/trace/${agentId}`));
    tool('botindex_dashboard', 'Full premium dashboard. $0.50', {}, () => fetchBotindex('/dashboard'));
    // Zora
    tool('botindex_zora_trending_coins', 'Trending Zora coins. $0.03', { limit: zod_1.z.number().optional() }, ({ limit }) => {
        const p = {};
        if (limit)
            p.limit = String(limit);
        return fetchBotindex('/zora/trending-coins', p);
    });
    tool('botindex_zora_creator_scores', 'Zora creator scores. $0.03', { limit: zod_1.z.number().optional() }, ({ limit }) => {
        const p = {};
        if (limit)
            p.limit = String(limit);
        return fetchBotindex('/zora/creator-scores', p);
    });
    tool('botindex_zora_attention_momentum', 'Zora attention momentum. $0.03', { limit: zod_1.z.number().optional() }, ({ limit }) => {
        const p = {};
        if (limit)
            p.limit = String(limit);
        return fetchBotindex('/zora/attention-momentum', p);
    });
    // Hyperliquid
    tool('botindex_hl_funding_arb', 'HL funding rate arb. $0.05', {}, () => fetchBotindex('/hyperliquid/funding-arb'));
    tool('botindex_hl_correlation_matrix', 'HL perp correlation matrix. $0.05', {}, () => fetchBotindex('/hyperliquid/correlation-matrix'));
    tool('botindex_hl_liquidation_heatmap', 'HL liquidation heatmap. $0.05', {}, () => fetchBotindex('/hyperliquid/liquidation-heatmap'));
    tool('botindex_hl_coin_analytics', 'Deep HL coin analytics. $0.05', { address: zod_1.z.string() }, ({ address }) => fetchBotindex(`/hyperliquid/coin-analytics?address=${encodeURIComponent(address)}`));
    return server;
}
// ── Routes ────────────────────────────────────────────────────────
mcpRouter.post('/', async (req, res) => {
    if (!await loadSdk()) {
        sendErr(res, 503, -32603, 'MCP SDK unavailable');
        return;
    }
    try {
        const sessionId = getSessionId(req);
        if (sessionId) {
            const s = sessions.get(sessionId);
            if (!s) {
                sendErr(res, 404, -32001, 'Session not found');
                return;
            }
            await s.transport.handleRequest(req, res, req.body);
            return;
        }
        const server = createServer();
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => (0, node_crypto_1.randomUUID)(),
            onsessioninitialized: (id) => { sessions.set(id, { server, transport }); },
            onsessionclosed: (id) => { const s = sessions.get(id); sessions.delete(id); if (s)
                void s.server.close().catch(() => { }); },
        });
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        if (!transport.sessionId)
            await server.close();
    }
    catch (err) {
        console.error('MCP POST error:', err);
        if (!res.headersSent)
            sendErr(res, 500, -32603, 'Internal server error');
    }
});
const handleSession = async (req, res) => {
    if (!await loadSdk()) {
        sendErr(res, 503, -32603, 'MCP SDK unavailable');
        return;
    }
    const sessionId = getSessionId(req);
    if (!sessionId) {
        sendErr(res, 400, -32000, 'Mcp-Session-Id header required');
        return;
    }
    const s = sessions.get(sessionId);
    if (!s) {
        sendErr(res, 404, -32001, 'Session not found');
        return;
    }
    await s.transport.handleRequest(req, res);
    if (req.method === 'DELETE') {
        sessions.delete(sessionId);
        await s.server.close().catch(() => { });
    }
};
mcpRouter.get('/', async (req, res) => {
    try {
        await handleSession(req, res);
    }
    catch (err) {
        console.error('MCP GET error:', err);
        if (!res.headersSent)
            sendErr(res, 500, -32603, 'Internal error');
    }
});
mcpRouter.delete('/', async (req, res) => {
    try {
        await handleSession(req, res);
    }
    catch (err) {
        console.error('MCP DELETE error:', err);
        if (!res.headersSent)
            sendErr(res, 500, -32603, 'Internal error');
    }
});
exports.default = mcpRouter;
//# sourceMappingURL=mcp.js.map
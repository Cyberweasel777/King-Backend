"use strict";
/**
 * King Backend — Main Server
 * Canary Deployment: BotIndex, MemeRadar, ArbWatch
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const index_1 = __importDefault(require("./routes/index"));
const admin_hits_1 = __importDefault(require("./routes/admin-hits"));
const well_known_1 = __importDefault(require("./routes/well-known"));
const receipts_1 = __importStar(require("./routes/receipts"));
const botindex_1 = require("./routes/botindex");
const errorHandler_1 = require("./middleware/errorHandler");
const hitCounter_1 = require("./middleware/hitCounter");
const apiKeyAuth_1 = require("./middleware/apiKeyAuth");
const anonRateLimit_1 = require("./middleware/anonRateLimit");
const eventLogger_1 = require("./middleware/eventLogger");
const x402Gate_1 = require("./middleware/x402Gate");
const receiptMiddleware_1 = require("./middleware/receiptMiddleware");
const mcp_1 = __importDefault(require("./routes/mcp"));
const mcp_catalog_1 = __importDefault(require("./routes/mcp-catalog"));
const docs_1 = __importDefault(require("./routes/docs"));
const agorion_1 = __importDefault(require("./routes/agorion"));
const botindex_meme_1 = __importDefault(require("./routes/botindex-meme"));
const botindex_stablecoin_1 = __importDefault(require("./routes/botindex-stablecoin"));
const botindex_synthesis_1 = __importDefault(require("./routes/botindex-synthesis"));
const botindex_sentinel_1 = __importDefault(require("./routes/botindex-sentinel"));
const database_1 = require("../shared/payments/database");
const logger_1 = __importDefault(require("../config/logger"));
const sentry_1 = require("../config/sentry");
const posthog_1 = require("../config/posthog");
const upstash_1 = require("../config/upstash");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 8080;
const x402Config = (0, x402Gate_1.getX402RuntimeConfig)();
// Always mount x402/v1 routes — individual gates pass through when x402 is disabled
(0, botindex_1.mountBotindexX402TestRoute)();
// Security middleware
app.use((0, helmet_1.default)({
    contentSecurityPolicy: {
        directives: {
            ...helmet_1.default.contentSecurityPolicy.getDefaultDirectives(),
            'form-action': ["'self'", 'https://checkout.stripe.com', 'https://api.botindex.dev'],
        },
    },
}));
app.use((0, cors_1.default)());
// Stripe webhook needs raw body
app.use('/api/:app/payments/webhook', express_1.default.raw({ type: 'application/json' }));
app.use('/api/botindex/zora/bot/stripe-webhook', express_1.default.raw({ type: 'application/json' }));
// JSON parser for other routes
app.use(express_1.default.json({ limit: '10mb' }));
// Agent discovery endpoints (no auth, no middleware)
app.use('/.well-known', well_known_1.default);
// MCP Streamable HTTP transport (no auth — Smithery handles auth)
app.use('/mcp', mcp_1.default);
// OpenAPI specs (public, no auth)
const openapi_json_1 = __importDefault(require("./routes/openapi.json"));
const openapi_gpt_json_1 = __importDefault(require("./routes/openapi-gpt.json"));
app.get('/api/botindex/v1/openapi.json', (_req, res) => {
    res.json(openapi_json_1.default);
});
app.get('/api/botindex/v1/openapi-gpt.json', (_req, res) => {
    res.json(openapi_gpt_json_1.default);
});
// Health check
app.get('/health', async (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        canary: ['botindex', 'memeradar', 'arbwatch', 'skinsignal', 'agorion'],
        botindexDomains: ['sports', 'crypto', 'commerce', 'zora', 'hyperliquid', 'genesis', 'signals'],
        x402: {
            enabled: x402Config.enabled,
            network: x402Config.network,
        },
    });
});
// Track BotIndex/x402/PolyHacks endpoint hits (in-memory, zero I/O)
app.use(hitCounter_1.hitCounter);
// Landing page beacons (public, no auth — must be before ALL other middleware)
const BEACON_PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
// MCP Tool Catalog — for dynamic tool discovery by MCP servers (public, no auth)
app.use('/api/botindex', mcp_catalog_1.default);
// Agorion auto-discovery crawler and registry API
app.use('/api/agorion', agorion_1.default);
// BotIndex beacon
app.get('/api/botindex/beacon', (req, res) => {
    res.set({
        'Content-Type': 'image/gif',
        'Content-Length': String(BEACON_PIXEL.length),
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Access-Control-Allow-Origin': '*',
    });
    res.end(BEACON_PIXEL);
});
// PolyHacks beacon
app.get('/api/polyhacks/beacon', (req, res) => {
    res.set({
        'Content-Type': 'image/gif',
        'Content-Length': String(BEACON_PIXEL.length),
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Access-Control-Allow-Origin': '*',
    });
    res.end(BEACON_PIXEL);
});
// Agent Action Receipts for all BotIndex responses
app.use('/api/botindex', receiptMiddleware_1.receiptMiddleware);
// Inject _polyhacks CTA into all BotIndex JSON responses
const ctaInjector_1 = require("./middleware/ctaInjector");
app.use('/api/botindex', (0, ctaInjector_1.ctaInjector)());
// Mount admin telemetry first so it bypasses app-level subscription guards
app.use('/api', admin_hits_1.default);
// BotIndex API key auth (runs before free-trial/x402 route middleware)
app.use('/api/botindex', apiKeyAuth_1.optionalApiKey);
// Event logger — after optionalApiKey so req.apiKeyAuth is populated
app.use(eventLogger_1.eventLogger);
// Admin instrumentation endpoints
app.get('/api/botindex/admin/events/summary', eventLogger_1.eventsSummaryHandler);
app.get('/api/botindex/admin/key-health', eventLogger_1.keyHealthHandler);
// Anonymous rate limiting on high-value endpoints (3 req/day without API key, 100/day with free key)
// Rate limit all BotIndex endpoints (10 req/day anonymous)
// Soft-gated endpoints now included — bots get truncated data for 10 calls, then 429
app.use('/api/botindex', (0, anonRateLimit_1.anonRateLimit)([
    '/signals',
    '/v1/signals',
    '/v1/sports',
    '/v1/crypto',
    '/v1/crypto/tokens',
    '/v1/solana',
    '/v1/commerce',
    '/v1/zora',
    '/hyperliquid',
    '/doppler',
    '/zora',
    '/x402',
    '/zora/intel',
    '/hyperliquid/intel',
    '/crypto/intel',
    '/doppler/intel',
    // Previously excluded soft-gated endpoints — now rate limited too
    '/zora/trending-coins',
    '/hyperliquid/whale-alerts',
    '/hyperliquid/funding-arb',
    '/hyperliquid/correlation-matrix',
    // Synthesis endpoints
    '/smart-money-flow',
    '/risk-radar',
], [
    // Only exclude x402-paid or internal endpoints
    '/hyperliquid/liquidation-heatmap',
    '/hyperliquid/hip6',
    '/zora/new-coins',
    '/zora/creator-scores',
    '/zora/attention-momentum',
    '/doppler/launches',
    '/doppler/trending',
    '/compliance/headlines',
    '/compliance/signal-desk',
    '/alpha-scan',
    '/zora/relay',
]));
// Synthesis endpoints (cross-source intelligence — smart-money-flow, risk-radar)
app.use('/api/botindex', botindex_synthesis_1.default);
// Sentinel Intelligence (premium predictive signals — $49.99/mo)
app.use('/api/botindex', botindex_sentinel_1.default);
// Receipt and trust-layer endpoints
app.use('/api/botindex/receipts', receipts_1.default);
app.use('/api/botindex/.well-known', receipts_1.default);
app.get('/api/botindex/trust', receipts_1.trustLayerHandler);
// Premium Intel endpoints (DeepSeek-powered, $0.05/call)
// Must run optionalApiKey + pro bypass before intel gates (mounted outside index.ts router)
const botindex_intel_1 = __importDefault(require("./routes/botindex-intel"));
const botindex_contact_1 = __importDefault(require("./routes/botindex-contact"));
app.use('/api/botindex', apiKeyAuth_1.optionalApiKey, (req, _res, next) => {
    if (req.apiKeyAuth) {
        const isPaid = req.apiKeyAuth.plan === 'pro' || req.apiKeyAuth.plan === 'basic' || req.apiKeyAuth.plan === 'starter';
        if (isPaid) {
            req.__apiKeyAuthenticated = true;
            req.__freeTrialAuthenticated = true;
        }
    }
    next();
}, botindex_intel_1.default);
// MCP Streamable HTTP transport (for Smithery + remote MCP clients)
const mcp_transport_1 = __importDefault(require("./routes/mcp-transport"));
app.use('/api/botindex', mcp_transport_1.default);
// BotIndex Contact + Meme + Stablecoin intelligence routes
app.use('/api/botindex/contact', express_1.default.urlencoded({ extended: true }), express_1.default.json(), botindex_contact_1.default);
app.use('/api/botindex', botindex_meme_1.default);
app.use('/api/botindex', botindex_stablecoin_1.default);
// Mount all routes
app.use('/api', index_1.default);
// API Documentation
app.use('/docs', docs_1.default);
// Error handling
app.use(errorHandler_1.errorHandler);
// Privacy policy for GPT Store
app.get('/privacy', (_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html><html><head><title>BotIndex Privacy Policy</title></head><body style="font-family:sans-serif;max-width:800px;margin:40px auto;padding:0 20px;color:#333">
<h1>BotIndex Privacy Policy</h1>
<p><strong>Last updated:</strong> March 12, 2026</p>
<h2>Data We Collect</h2>
<p>When you use BotIndex through the GPT Store or API, we collect:</p>
<ul>
<li>API requests (endpoint, timestamp, IP address hash for rate limiting)</li>
<li>Email address (only if you register an API key)</li>
</ul>
<h2>How We Use Your Data</h2>
<ul>
<li>Rate limiting and abuse prevention</li>
<li>Service improvement and usage analytics</li>
<li>Account management (API key holders only)</li>
</ul>
<h2>Data We Do NOT Collect</h2>
<ul>
<li>We do not store your ChatGPT conversations</li>
<li>We do not sell or share personal data with third parties</li>
<li>We do not use tracking cookies</li>
</ul>
<h2>Data Retention</h2>
<p>API request logs are retained for 30 days. API key account data is retained until you request deletion.</p>
<h2>Contact</h2>
<p>For privacy inquiries: privacy@botindex.dev</p>
</body></html>`);
});
// Root redirect to landing page on Vercel
app.get('/', (_req, res) => {
    res.redirect(301, 'https://botindex.dev');
});
// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});
async function start() {
    // Initialize observability + infra
    (0, sentry_1.initSentry)();
    (0, posthog_1.initPostHog)();
    (0, upstash_1.initUpstash)();
    // Initialize database
    await (0, database_1.initDb)();
    await (0, receiptMiddleware_1.initReceiptSigning)();
    // Market surge monitor DISABLED — killing all Telegram bot alerts
    // const { startMarketSurgeMonitor } = await import('../services/botindex/market-surge-monitor');
    // startMarketSurgeMonitor();
    // Sentinel personal alert feed DISABLED — killing all Telegram bot alerts
    // const { sendPersonalSentinelAlert } = await import('../services/botindex/sentinel/signals');
    // setInterval(() => { void sendPersonalSentinelAlert(); }, 15 * 60 * 1000);
    // setTimeout(() => { void sendPersonalSentinelAlert(); }, 60_000);
    // Divergence Scanner DISABLED — killing all Telegram bot alerts
    // const { startDivergenceScanner } = await import('../services/botindex/sentinel/divergence-scanner');
    // startDivergenceScanner();
    // Resolve predictions every hour (check which predictions were right/wrong)
    const { resolvePredictions } = await Promise.resolve().then(() => __importStar(require('../services/botindex/sentinel/prediction-tracker')));
    setInterval(() => { void resolvePredictions(); }, 60 * 60 * 1000);
    // First resolution pass after 2 minutes
    setTimeout(() => { void resolvePredictions(); }, 2 * 60 * 1000);
    // Start Telegram subscriber bot (polls for /subscribe commands)
    const { startTelegramBot } = await Promise.resolve().then(() => __importStar(require('../services/botindex/sentinel/telegram-subscribers')));
    startTelegramBot();
    // Public Telegram relay DISABLED — ecosystem-only pivot, reducing channel noise
    // const { startPublicRelay } = await import('../services/botindex/sentinel/public-channel-relay');
    // startPublicRelay();
    app.listen(PORT, () => {
        logger_1.default.info({
            port: PORT,
            x402Enabled: x402Config.enabled,
            x402Network: x402Config.network,
        }, 'King Backend API started');
    });
}
start().catch((error) => {
    sentry_1.Sentry.captureException(error);
    logger_1.default.error({ err: error }, 'Failed to start API server');
});
// Graceful shutdown
process.on('SIGTERM', async () => {
    await (0, posthog_1.shutdownPostHog)();
    process.exit(0);
});
// Zora Alpha bot DISABLED — reducing overhead
// if (process.env.ZORA_ALPHA_BOT_TOKEN) {
//   import('../services/botindex/zora/alpha-bot').catch((error) => {
//     logger.error({ err: error }, 'Failed to start Zora Alpha bot polling service');
//   });
// }
exports.default = app;
// This won't work appended at end, need to insert before 404 handler
//# sourceMappingURL=server.js.map
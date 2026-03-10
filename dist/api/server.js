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
const x402Gate_1 = require("./middleware/x402Gate");
const receiptMiddleware_1 = require("./middleware/receiptMiddleware");
const mcp_1 = __importDefault(require("./routes/mcp"));
const docs_1 = __importDefault(require("./routes/docs"));
const database_1 = require("../shared/payments/database");
const logger_1 = __importDefault(require("../config/logger"));
const app = (0, express_1.default)();
const PORT = process.env.PORT || 8080;
const x402Config = (0, x402Gate_1.getX402RuntimeConfig)();
// Always mount x402/v1 routes — individual gates pass through when x402 is disabled
(0, botindex_1.mountBotindexX402TestRoute)();
// Security middleware
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)());
// Stripe webhook needs raw body
app.use('/api/:app/payments/webhook', express_1.default.raw({ type: 'application/json' }));
// JSON parser for other routes
app.use(express_1.default.json({ limit: '10mb' }));
// Agent discovery endpoints (no auth, no middleware)
app.use('/.well-known', well_known_1.default);
// MCP Streamable HTTP transport (no auth — Smithery handles auth)
app.use('/mcp', mcp_1.default);
// Health check
app.get('/health', async (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        canary: ['botindex', 'memeradar', 'arbwatch', 'skinsignal'],
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
// Mount admin telemetry first so it bypasses app-level subscription guards
app.use('/api', admin_hits_1.default);
// BotIndex API key auth (runs before free-trial/x402 route middleware)
app.use('/api/botindex', apiKeyAuth_1.optionalApiKey);
// Anonymous rate limiting on high-value endpoints (3 req/day without API key, 100/day with free key)
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
]));
// Receipt and trust-layer endpoints
app.use('/api/botindex/receipts', receipts_1.default);
app.use('/api/botindex/.well-known', receipts_1.default);
app.get('/api/botindex/trust', receipts_1.trustLayerHandler);
// Premium Intel endpoints (DeepSeek-powered, $0.05/call)
const botindex_intel_1 = __importDefault(require("./routes/botindex-intel"));
app.use('/api/botindex', botindex_intel_1.default);
// Mount all routes
app.use('/api', index_1.default);
// API Documentation
app.use('/docs', docs_1.default);
// Error handling
app.use(errorHandler_1.errorHandler);
// Root redirect to landing page on Vercel
app.get('/', (_req, res) => {
    res.redirect(301, 'https://botindex.dev');
});
// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});
async function start() {
    // Initialize database
    await (0, database_1.initDb)();
    await (0, receiptMiddleware_1.initReceiptSigning)();
    app.listen(PORT, () => {
        logger_1.default.info({
            port: PORT,
            x402Enabled: x402Config.enabled,
            x402Network: x402Config.network,
        }, 'King Backend API started');
    });
}
start().catch((error) => {
    logger_1.default.error({ err: error }, 'Failed to start API server');
});
exports.default = app;
//# sourceMappingURL=server.js.map
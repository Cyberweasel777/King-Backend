/**
 * King Backend — Main Server
 * Canary Deployment: BotIndex, MemeRadar, ArbWatch
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import routes from './routes/index';
import adminHitsRouter from './routes/admin-hits';
import wellKnownRouter from './routes/well-known';
import receiptsRouter, { trustLayerHandler } from './routes/receipts';
import { mountBotindexX402TestRoute } from './routes/botindex';
import { errorHandler } from './middleware/errorHandler';
import { hitCounter } from './middleware/hitCounter';
import { optionalApiKey } from './middleware/apiKeyAuth';
import { anonRateLimit } from './middleware/anonRateLimit';
import { eventLogger, eventsSummaryHandler, keyHealthHandler } from './middleware/eventLogger';
import { getX402RuntimeConfig } from './middleware/x402Gate';
import { initReceiptSigning, receiptMiddleware } from './middleware/receiptMiddleware';
import mcpRouter from './routes/mcp';
import mcpCatalogRouter from './routes/mcp-catalog';
import docsRouter from './routes/docs';
import agorionRouter from './routes/agorion';
import botindexMemeRouter from './routes/botindex-meme';
import botindexStablecoinRouter from './routes/botindex-stablecoin';
import botindexSynthesisRouter from './routes/botindex-synthesis';
import botindexSentinelRouter from './routes/botindex-sentinel';
import botindexAuthRouter from './routes/botindex-auth';
import { initDb } from '../shared/payments/database';
import logger from '../config/logger';
import { initSentry, Sentry } from '../config/sentry';
import { initPostHog, shutdownPostHog } from '../config/posthog';
import { initUpstash } from '../config/upstash';

const app = express();
const PORT = process.env.PORT || 8080;
const x402Config = getX402RuntimeConfig();

// Always mount x402/v1 routes — individual gates pass through when x402 is disabled
mountBotindexX402TestRoute();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'form-action': ["'self'", 'https://checkout.stripe.com', 'https://api.botindex.dev'],
    },
  },
}));
app.use(cors());

// Stripe webhook needs raw body
app.use('/api/:app/payments/webhook', express.raw({ type: 'application/json' }));
app.use('/api/botindex/zora/bot/stripe-webhook', express.raw({ type: 'application/json' }));

// JSON parser for other routes
app.use(express.json({ limit: '10mb' }));

// Agent discovery endpoints (no auth, no middleware)
app.use('/.well-known', wellKnownRouter);

// MCP Streamable HTTP transport (no auth — Smithery handles auth)
app.use('/mcp', mcpRouter);

// OpenAPI specs (public, no auth)
import openapiSpec from './routes/openapi.json';
import openapiGptSpec from './routes/openapi-gpt.json';
app.get('/api/botindex/v1/openapi.json', (_req, res) => {
  res.json(openapiSpec);
});
app.get('/api/botindex/v1/openapi-gpt.json', (_req, res) => {
  res.json(openapiGptSpec);
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
app.use(hitCounter);

// Landing page beacons (public, no auth — must be before ALL other middleware)
const BEACON_PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

// MCP Tool Catalog — for dynamic tool discovery by MCP servers (public, no auth)
app.use('/api/botindex', mcpCatalogRouter);

// Agorion auto-discovery crawler and registry API
app.use('/api/agorion', agorionRouter);

// BaseRadar public API (no auth, no rate limiting)
import baseradarRouter from './routes/baseradar';
app.use('/api/baseradar', baseradarRouter);

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
app.use('/api/botindex', receiptMiddleware);

// Inject _polyhacks CTA into all BotIndex JSON responses
import { ctaInjector } from './middleware/ctaInjector';
app.use('/api/botindex', ctaInjector());

// Mount admin telemetry first so it bypasses app-level subscription guards
app.use('/api', adminHitsRouter);

// BotIndex API key auth (runs before free-trial/x402 route middleware)
app.use('/api/botindex', optionalApiKey);

// Event logger — after optionalApiKey so req.apiKeyAuth is populated
app.use(eventLogger);

// Admin instrumentation endpoints
app.get('/api/botindex/admin/events/summary', eventsSummaryHandler);
app.get('/api/botindex/admin/key-health', keyHealthHandler);

// Anonymous rate limiting on high-value endpoints (3 req/day without API key, 100/day with free key)
// Rate limit all BotIndex endpoints (10 req/day anonymous)
// Soft-gated endpoints now included — bots get truncated data for 10 calls, then 429
app.use('/api/botindex', anonRateLimit([
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
app.use('/api/botindex', botindexSynthesisRouter);

// Sentinel Intelligence (premium predictive signals — $49.99/mo)
app.use('/api/botindex', botindexSentinelRouter);

// Magic link auth (no rate limit — it's email-gated)
app.use('/api/botindex', botindexAuthRouter);

// Receipt and trust-layer endpoints
app.use('/api/botindex/receipts', receiptsRouter);
app.use('/api/botindex/.well-known', receiptsRouter);
app.get('/api/botindex/trust', trustLayerHandler);

// Premium Intel endpoints (DeepSeek-powered, $0.05/call)
// Must run optionalApiKey + pro bypass before intel gates (mounted outside index.ts router)
import botindexIntelRouter from './routes/botindex-intel';
import botindexContactRouter from './routes/botindex-contact';
app.use('/api/botindex', optionalApiKey, (req, _res, next) => {
  if (req.apiKeyAuth) {
    const isPaid = req.apiKeyAuth.plan === 'pro' || req.apiKeyAuth.plan === 'basic' || req.apiKeyAuth.plan === 'starter';
    if (isPaid) {
      (req as any).__apiKeyAuthenticated = true;
      (req as any).__freeTrialAuthenticated = true;
    }
  }
  next();
}, botindexIntelRouter);

// MCP Streamable HTTP transport (for Smithery + remote MCP clients)
import mcpTransportRouter from './routes/mcp-transport';
app.use('/api/botindex', mcpTransportRouter);

// BotIndex Contact + Meme + Stablecoin intelligence routes
app.use('/api/botindex/contact', express.urlencoded({ extended: true }), express.json(), botindexContactRouter);
app.use('/api/botindex', botindexMemeRouter);
app.use('/api/botindex', botindexStablecoinRouter);

// Mount all routes
app.use('/api', routes);

// API Documentation
app.use('/docs', docsRouter);

// Error handling
app.use(errorHandler);

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
  initSentry();
  initPostHog();
  initUpstash();

  // Initialize database
  await initDb();
  await initReceiptSigning();
  
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
  const { resolvePredictions } = await import('../services/botindex/sentinel/prediction-tracker');
  setInterval(() => { void resolvePredictions(); }, 60 * 60 * 1000);
  // First resolution pass after 2 minutes
  setTimeout(() => { void resolvePredictions(); }, 2 * 60 * 1000);

  // Start Telegram subscriber bot (polls for /subscribe commands)
  const { startTelegramBot } = await import('../services/botindex/sentinel/telegram-subscribers');
  startTelegramBot();

  // Public Telegram relay DISABLED — ecosystem-only pivot, reducing channel noise
  // const { startPublicRelay } = await import('../services/botindex/sentinel/public-channel-relay');
  // startPublicRelay();
  
  app.listen(PORT, () => {
    logger.info(
      {
        port: PORT,
        x402Enabled: x402Config.enabled,
        x402Network: x402Config.network,
      },
      'King Backend API started'
    );
  });
}

start().catch((error) => {
  Sentry.captureException(error);
  logger.error({ err: error }, 'Failed to start API server');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await shutdownPostHog();
  process.exit(0);
});

// Zora Alpha bot DISABLED — reducing overhead
// if (process.env.ZORA_ALPHA_BOT_TOKEN) {
//   import('../services/botindex/zora/alpha-bot').catch((error) => {
//     logger.error({ err: error }, 'Failed to start Zora Alpha bot polling service');
//   });
// }

export default app;
// This won't work appended at end, need to insert before 404 handler

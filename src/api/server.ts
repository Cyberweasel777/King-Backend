/**
 * King Backend — Main Server
 * Canary Deployment: BotIndex, MemeRadar, ArbWatch
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { wellKnownHandler } from '@botindex/aar';
import routes from './routes/index';
import adminHitsRouter from './routes/admin-hits';
import wellKnownRouter from './routes/well-known';
import receiptsRouter, { trustLayerHandler } from './routes/receipts';
import { mountBotindexX402TestRoute } from './routes/botindex';
import { errorHandler } from './middleware/errorHandler';
import { hitCounter } from './middleware/hitCounter';
import { optionalApiKey } from './middleware/apiKeyAuth';
import { anonRateLimit } from './middleware/anonRateLimit';
import { getX402RuntimeConfig } from './middleware/x402Gate';
import {
  getReceiptSigningSecretKey,
  initReceiptSigning,
  receiptMiddleware,
} from './middleware/receiptMiddleware';
import mcpRouter from './routes/mcp';
import { initDb } from '../shared/payments/database';
import logger from '../config/logger';

const app = express();
const PORT = process.env.PORT || 8080;
const x402Config = getX402RuntimeConfig();

// Always mount x402/v1 routes — individual gates pass through when x402 is disabled
mountBotindexX402TestRoute();

// Security middleware
app.use(helmet());
app.use(cors());

// Stripe webhook needs raw body
app.use('/api/:app/payments/webhook', express.raw({ type: 'application/json' }));

// JSON parser for other routes
app.use(express.json({ limit: '10mb' }));

// Agent discovery endpoints (no auth, no middleware)
app.use('/.well-known', wellKnownRouter);
app.get('/.well-known/aar-configuration', (req, res, next) => {
  try {
    wellKnownHandler({
      agentId: 'botindex/v1',
      agentName: 'BotIndex',
      agentVersion: '1.0',
      secretKey: getReceiptSigningSecretKey(),
      receiptHeader: 'X-BotIndex-Receipt',
    })(req, res);
  } catch (err) {
    next(err);
  }
});

// MCP Streamable HTTP transport (no auth — Smithery handles auth)
app.use('/mcp', mcpRouter);

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

// Track BotIndex/x402 endpoint hits (in-memory, zero I/O)
app.use(hitCounter);

// Agent Action Receipts for all BotIndex responses
app.use('/api/botindex', receiptMiddleware);

// Mount admin telemetry first so it bypasses app-level subscription guards
app.use('/api', adminHitsRouter);

// BotIndex API key auth (runs before free-trial/x402 route middleware)
app.use('/api/botindex', optionalApiKey);

// Anonymous rate limiting on high-value free endpoints (5 req/hr without API key)
app.use('/api/botindex', anonRateLimit([
  '/signals',
  '/v1/signals',
  '/v1/sports',
  '/v1/crypto',
  '/v1/solana',
  '/v1/commerce',
  '/hyperliquid',
  '/zora',
  '/x402',
]));

// Receipt and trust-layer endpoints
app.use('/api/botindex/receipts', receiptsRouter);
app.use('/api/botindex/.well-known', receiptsRouter);
app.get('/api/botindex/trust', trustLayerHandler);

// Mount all routes
app.use('/api', routes);

// Error handling
app.use(errorHandler);

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
  await initDb();
  await initReceiptSigning();
  
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
  logger.error({ err: error }, 'Failed to start API server');
});

export default app;

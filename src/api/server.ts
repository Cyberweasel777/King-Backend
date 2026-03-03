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
import { mountBotindexX402TestRoute } from './routes/botindex';
import { errorHandler } from './middleware/errorHandler';
import { hitCounter } from './middleware/hitCounter';
import { getX402RuntimeConfig } from './middleware/x402Gate';
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
app.use(express.json());

// Health check
app.get('/health', async (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    canary: ['botindex', 'memeradar', 'arbwatch', 'skinsignal'],
    x402: {
      enabled: x402Config.enabled,
      network: x402Config.network,
    },
  });
});

// Track BotIndex/x402 endpoint hits (in-memory, zero I/O)
app.use(hitCounter);

// Mount admin telemetry first so it bypasses app-level subscription guards
app.use('/api', adminHitsRouter);

// Mount all routes
app.use('/api', routes);

// Error handling
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

async function start() {
  // Initialize database
  await initDb();
  
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

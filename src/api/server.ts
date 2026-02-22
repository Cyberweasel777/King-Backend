/**
 * King Backend — Main Server
 * Canary Deployment: BotIndex, MemeRadar, ArbWatch
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import routes from './routes/index';
import { errorHandler } from './middleware/errorHandler';
import { initDb } from '../shared/payments/database';

const app = express();
const PORT = process.env.PORT || 8080;

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
    canary: ['botindex', 'memeradar', 'arbwatch', 'skinsignal']
  });
});

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
    console.log(`☦️  King Backend running on port ${PORT}`);
    console.log(`Health: http://localhost:${PORT}/health`);
    console.log('Canary apps: botindex, memeradar, arbwatch, skinsignal');
  });
}

start().catch(console.error);

export default app;

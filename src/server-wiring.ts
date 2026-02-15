/**
 * PHASE 3: WIRE PAYMENT MODULE INTO KING BACKEND
 * 
 * This shows how to mount the payment routes and integrate
 * into the existing King Backend architecture.
 */

import express from 'express';
import paymentsRouter from './api/routes/payments';
import { initDb } from './shared/payments/database';

const app = express();

// ========== MIDDLEWARE ==========

// Raw body parser for Stripe webhooks (must be before JSON parser)
app.use('/api/:app/payments/webhook', express.raw({ type: 'application/json' }));

// Regular JSON parser for other routes
app.use(express.json());

// ========== MOUNT PAYMENT ROUTES ==========

// This mounts all payment endpoints for all apps
// /api/spreadhunter/payments/*
// /api/deckvault/payments/*
// etc.
app.use('/api', paymentsRouter);

// ========== STARTUP ==========

async function startServer() {
  // Initialize Supabase connection
  await initDb();
  
  app.listen(8080, () => {
    console.log('King Backend running on port 8080');
    console.log('Payment endpoints mounted at /api/{app}/payments/*');
  });
}

startServer();

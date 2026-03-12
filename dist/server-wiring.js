"use strict";
/**
 * PHASE 3: WIRE PAYMENT MODULE INTO KING BACKEND
 *
 * This shows how to mount the payment routes and integrate
 * into the existing King Backend architecture.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const payments_1 = __importDefault(require("./api/routes/payments"));
const database_1 = require("./shared/payments/database");
const logger_1 = require("./utils/logger");
const app = (0, express_1.default)();
// ========== MIDDLEWARE ==========
// Raw body parser for Stripe webhooks (must be before JSON parser)
app.use('/api/:app/payments/webhook', express_1.default.raw({ type: 'application/json' }));
// Regular JSON parser for other routes
app.use(express_1.default.json());
// ========== MOUNT PAYMENT ROUTES ==========
// This mounts all payment endpoints for all apps
// /api/spreadhunter/payments/*
// /api/deckvault/payments/*
// etc.
app.use('/api', payments_1.default);
// ========== STARTUP ==========
async function startServer() {
    // Initialize Supabase connection
    await (0, database_1.initDb)();
    app.listen(8080, () => {
        logger_1.logger.info('King Backend running on port 8080');
        logger_1.logger.info('Payment endpoints mounted at /api/{app}/payments/*');
    });
}
startServer();
//# sourceMappingURL=server-wiring.js.map
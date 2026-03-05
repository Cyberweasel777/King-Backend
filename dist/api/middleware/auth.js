"use strict";
/**
 * Authentication Middleware
 * JWT validation using Supabase
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
exports.optionalAuth = optionalAuth;
const database_1 = require("../../config/database");
const logger_1 = __importDefault(require("../../config/logger"));
/**
 * Extract Bearer token from Authorization header
 */
function extractToken(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader)
        return null;
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer')
        return null;
    return parts[1];
}
/**
 * Middleware to require authentication
 */
async function requireAuth(req, res, next) {
    try {
        const token = extractToken(req);
        if (!token) {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }
        // Verify with Supabase
        const { data: { user }, error } = await database_1.supabaseAnon.auth.getUser(token);
        if (error || !user) {
            res.status(401).json({ error: 'Invalid or expired token' });
            return;
        }
        // Attach user to request
        req.user = {
            id: user.id,
            email: user.email,
            role: user.role,
        };
        next();
    }
    catch (error) {
        logger_1.default.error('Auth error:', error);
        res.status(401).json({ error: 'Authentication failed' });
    }
}
/**
 * Middleware to optionally authenticate (attach user if token present)
 */
async function optionalAuth(req, res, next) {
    try {
        const token = extractToken(req);
        if (token) {
            const { data: { user } } = await database_1.supabaseAnon.auth.getUser(token);
            if (user) {
                req.user = {
                    id: user.id,
                    email: user.email,
                    role: user.role,
                };
            }
        }
        next();
    }
    catch {
        // Continue without user if token is invalid
        next();
    }
}
exports.default = { requireAuth, optionalAuth };
//# sourceMappingURL=auth.js.map
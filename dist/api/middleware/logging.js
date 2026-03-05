"use strict";
/**
 * Logging Middleware
 * Request/response logging
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestLogger = requestLogger;
const logger_1 = __importDefault(require("../../config/logger"));
function requestLogger(req, res, next) {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        const level = res.statusCode >= 400 ? 'warn' : 'debug';
        logger_1.default[level](`${req.method} ${req.path} ${res.statusCode} ${duration}ms`, {
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            duration,
            ip: req.ip,
            userAgent: req.get('user-agent'),
        });
    });
    next();
}
exports.default = requestLogger;
//# sourceMappingURL=logging.js.map
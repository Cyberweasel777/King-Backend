"use strict";
/**
 * Logger Configuration - King Backend
 * Unified structured logging across all process groups
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const pino_1 = __importDefault(require("pino"));
const isDev = process.env.NODE_ENV !== 'production';
const logLevel = process.env.LOG_LEVEL || (isDev ? 'debug' : 'info');
const logger = (0, pino_1.default)({
    level: logLevel,
    transport: isDev
        ? {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
            },
        }
        : undefined,
    base: {
        env: process.env.NODE_ENV,
        version: process.env.npm_package_version,
    },
    // Add app context from any log call
    mixin() {
        return {
            process: process.env.FLY_PROCESS_GROUP || 'unknown',
        };
    },
});
exports.default = logger;
//# sourceMappingURL=logger.js.map
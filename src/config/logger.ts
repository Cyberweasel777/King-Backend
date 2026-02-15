/**
 * Logger Configuration - King Backend
 * Unified structured logging across all process groups
 */

import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';
const logLevel = process.env.LOG_LEVEL || (isDev ? 'debug' : 'info');

const logger = pino({
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

export default logger;

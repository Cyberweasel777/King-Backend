/**
 * Sentry Error Tracking — catches unhandled errors with full stack traces.
 * Free tier: 5K errors/mo.
 */

import * as Sentry from '@sentry/node';
import logger from './logger';

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    logger.warn('No SENTRY_DSN — error tracking disabled');
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'production',
    tracesSampleRate: 0.1, // 10% of transactions
    profilesSampleRate: 0,
    beforeSend(event) {
      // Strip sensitive data
      if (event.request?.headers) {
        delete event.request.headers['x-api-key'];
        delete event.request.headers['authorization'];
      }
      return event;
    },
  });

  logger.info('Sentry error tracking initialized');
}

export { Sentry };

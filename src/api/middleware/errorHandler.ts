/**
 * Error Handler Middleware
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../../utils/logger';
import { Sentry } from '../../config/sentry';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  Sentry.captureException(err, { extra: { path: req.path, method: req.method } });
  logger.error({ err, path: req.path, method: req.method }, 'Unhandled error');
  
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
}

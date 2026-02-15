import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

// Unified logger for King Backend
export const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  transport: isDev ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'yyyy-mm-dd HH:MM:ss',
    },
  } : undefined,
  base: {
    service: 'king-backend',
    version: '1.0.0',
    environment: process.env.NODE_ENV,
  },
});

// App-specific logger
export function getAppLogger(appId: string) {
  return logger.child({ app: appId });
}

// Request logging middleware
export function requestLogger() {
  return (req: any, res: any, next: any) => {
    const start = Date.now();

    res.on('finish', () => {
      logger.info({
        req: {
          method: req.method,
          url: req.url,
          path: req.path,
          app: req.appId,
        },
        res: {
          statusCode: res.statusCode,
        },
        duration: Date.now() - start,
      }, 'request completed');
    });

    next();
  };
}

export default logger;

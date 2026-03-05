"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
exports.getAppLogger = getAppLogger;
exports.requestLogger = requestLogger;
const pino_1 = __importDefault(require("pino"));
const isDev = process.env.NODE_ENV !== 'production';
// Unified logger for King Backend
exports.logger = (0, pino_1.default)({
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
function getAppLogger(appId) {
    return exports.logger.child({ app: appId });
}
// Request logging middleware
function requestLogger() {
    return (req, res, next) => {
        const start = Date.now();
        res.on('finish', () => {
            exports.logger.info({
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
exports.default = exports.logger;
//# sourceMappingURL=logger.js.map
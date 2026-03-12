"use strict";
/**
 * Error Handler Middleware
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
const logger_1 = require("../../utils/logger");
function errorHandler(err, req, res, next) {
    logger_1.logger.error({ err, path: req.path, method: req.method }, 'Unhandled error');
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
}
//# sourceMappingURL=errorHandler.js.map
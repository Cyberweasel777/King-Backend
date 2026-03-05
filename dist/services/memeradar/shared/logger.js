"use strict";
/**
 * Shared Logger Utility
 * Structured logging with timestamps and levels
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLogger = createLogger;
class Logger {
    agent;
    level;
    levelPriority = {
        debug: 0,
        info: 1,
        warn: 2,
        error: 3,
    };
    constructor(agent, level = 'info') {
        this.agent = agent;
        this.level = level;
    }
    shouldLog(level) {
        return this.levelPriority[level] >= this.levelPriority[this.level];
    }
    log(level, message, data) {
        if (!this.shouldLog(level))
            return;
        const entry = {
            timestamp: new Date().toISOString(),
            level,
            agent: this.agent,
            message,
            data,
        };
        const prefix = `[${entry.timestamp}] [${level.toUpperCase()}] [${this.agent}]`;
        switch (level) {
            case 'debug':
                console.debug(prefix, message, data || '');
                break;
            case 'info':
                console.log(prefix, message, data || '');
                break;
            case 'warn':
                console.warn(prefix, message, data || '');
                break;
            case 'error':
                console.error(prefix, message, data || '');
                break;
        }
    }
    debug(message, data) {
        this.log('debug', message, data);
    }
    info(message, data) {
        this.log('info', message, data);
    }
    warn(message, data) {
        this.log('warn', message, data);
    }
    error(message, data) {
        this.log('error', message, data);
    }
}
function createLogger(agent, level) {
    return new Logger(agent, level);
}
exports.default = Logger;
//# sourceMappingURL=logger.js.map
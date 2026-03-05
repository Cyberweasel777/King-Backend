/**
 * Shared Logger Utility
 * Structured logging with timestamps and levels
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
declare class Logger {
    private agent;
    private level;
    private levelPriority;
    constructor(agent: string, level?: LogLevel);
    private shouldLog;
    private log;
    debug(message: string, data?: any): void;
    info(message: string, data?: any): void;
    warn(message: string, data?: any): void;
    error(message: string, data?: any): void;
}
export declare function createLogger(agent: string, level?: LogLevel): Logger;
export default Logger;
//# sourceMappingURL=logger.d.ts.map
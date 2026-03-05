import pino from 'pino';
export declare const logger: import("pino").Logger<never>;
export declare function getAppLogger(appId: string): pino.Logger<never>;
export declare function requestLogger(): (req: any, res: any, next: any) => void;
export default logger;
//# sourceMappingURL=logger.d.ts.map
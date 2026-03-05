import type { NextFunction, Request, Response } from 'express';
type HitEntry = {
    count: number;
    lastHit: string;
    uniqueVisitors: number;
    visitorHashes: string[];
};
export declare function hitCounter(req: Request, res: Response, next: NextFunction): void;
export declare function getHits(): {
    uptime_seconds: number;
    total_hits: number;
    unique_visitors_total: number;
    hits_per_minute: number;
    endpoints: Record<string, HitEntry>;
    since: string;
    last_restart: string;
};
export {};
//# sourceMappingURL=hitCounter.d.ts.map
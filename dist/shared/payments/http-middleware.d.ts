/**
 * HTTP (Express) subscription middleware
 *
 * We don't have Supabase auth wired yet, so this middleware uses an external user id
 * (e.g., Telegram user id) passed via header or querystring:
 *   - header: x-external-user-id
 *   - query:  ?user=8063432083
 */
import type { Request, Response, NextFunction } from 'express';
import type { AppId, SubscriptionTier } from './types';
type FreeLimitOptions = {
    /** max free requests per UTC day */
    perDay: number;
    /** identify caller: external user id if present, otherwise ip */
    key: (req: Request) => string;
};
export declare function withSubscriptionHttp(appId: AppId, minimumTier?: SubscriptionTier): (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare function withFreeLimit(options: FreeLimitOptions): (req: Request, res: Response, next: NextFunction) => void;
export declare function getFreeLimitKey(req: Request): string;
export {};
//# sourceMappingURL=http-middleware.d.ts.map
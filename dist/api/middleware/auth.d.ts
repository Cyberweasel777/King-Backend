/**
 * Authentication Middleware
 * JWT validation using Supabase
 */
import { Request, Response, NextFunction } from 'express';
declare global {
    namespace Express {
        interface Request {
            user?: {
                id: string;
                email?: string;
                role?: string;
            };
        }
    }
}
/**
 * Middleware to require authentication
 */
export declare function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void>;
/**
 * Middleware to optionally authenticate (attach user if token present)
 */
export declare function optionalAuth(req: Request, res: Response, next: NextFunction): Promise<void>;
declare const _default: {
    requireAuth: typeof requireAuth;
    optionalAuth: typeof optionalAuth;
};
export default _default;
//# sourceMappingURL=auth.d.ts.map
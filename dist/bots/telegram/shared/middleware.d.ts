export interface RateLimitConfig {
    windowMs: number;
    maxRequests: number;
}
export declare function allowCommand(userId: string | undefined, config?: RateLimitConfig): boolean;
export declare function escapeMd(input: string): string;
export declare function extractArg(text: string | undefined, maxLength?: number): string;
export declare function shortAddress(address: string): string;
//# sourceMappingURL=middleware.d.ts.map
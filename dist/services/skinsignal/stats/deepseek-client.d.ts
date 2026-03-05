/**
 * SkinSignal DeepSeek Client — King Backend
 * Thin OpenAI-compatible wrapper with concurrency limit (3) and graceful fallback
 */
export interface DeepSeekOpts {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    requireJson?: boolean;
}
export declare function callDeepSeek(system: string, user: string, opts?: DeepSeekOpts): Promise<string>;
export declare function parseDeepSeekJson<T>(system: string, user: string, fallback: () => T, opts?: DeepSeekOpts): Promise<{
    data: T | null;
    fromApi: boolean;
    error?: string;
}>;
//# sourceMappingURL=deepseek-client.d.ts.map
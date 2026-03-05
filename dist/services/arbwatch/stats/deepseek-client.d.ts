/** ArbWatch DeepSeek Stats - DeepSeek Client */
import { PromptType } from './prompts';
/** Strip markdown code fences from response */
declare function stripMarkdownFences(text: string): string;
/** Parse JSON response with fallback */
declare function parseJsonResponse<T>(text: string): T | null;
/** Main DeepSeek API client */
export declare function callDeepSeek<T>(promptType: PromptType, userContent: string, options?: {
    deepAnalysis?: boolean;
    timeoutMs?: number;
}): Promise<{
    result: T | null;
    error: string | null;
    modelUsed: string;
}>;
/** Check if DeepSeek API is available */
export declare function checkApiHealth(): Promise<boolean>;
export { stripMarkdownFences, parseJsonResponse };
//# sourceMappingURL=deepseek-client.d.ts.map
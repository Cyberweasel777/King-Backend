/** BotIndex DeepSeek Stats - DeepSeek Client */
import { PromptType } from './prompts';
declare function stripMarkdownFences(text: string): string;
declare function parseJsonResponse<T>(text: string): T | null;
export declare function callDeepSeek<T>(promptType: PromptType, userContent: string, options?: {
    deepAnalysis?: boolean;
    timeoutMs?: number;
}): Promise<{
    result: T | null;
    error: string | null;
    modelUsed: string;
}>;
export declare function checkApiHealth(): Promise<boolean>;
export { stripMarkdownFences, parseJsonResponse };
//# sourceMappingURL=deepseek-client.d.ts.map
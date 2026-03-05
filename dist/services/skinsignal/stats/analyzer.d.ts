/**
 * SkinSignal Spread Analyzer — King Backend
 * DeepSeek AI-powered analysis with local fallback
 */
import { DeepSeekOpts } from './deepseek-client';
import { SpreadAnalysis, SkinSpreadInput } from './types';
export declare function analyzeSpread(input: SkinSpreadInput, opts?: DeepSeekOpts): Promise<{
    data: SpreadAnalysis | null;
    fromApi: boolean;
    error?: string;
}>;
//# sourceMappingURL=analyzer.d.ts.map
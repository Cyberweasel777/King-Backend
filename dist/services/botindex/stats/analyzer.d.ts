/** BotIndex DeepSeek Stats - Analyzer */
import { CorrelationInput, CorrelationResult, PCAInput, PCAResult, RegimeInput, RegimeResult, GrangerInput, GrangerResult, VolatilityInput, VolatilityResult, CorrelationMatrixInput, CorrelationMatrixResult } from './types';
/** Local fallback: Pearson correlation */
declare function localCorrelation(input: CorrelationInput): CorrelationResult;
/** Local fallback: Simple clustering */
declare function localPCA(input: PCAInput): PCAResult;
/** Local fallback: Regime detection */
declare function localRegime(input: RegimeInput): RegimeResult;
/** Local fallback: Granger causality approximation */
declare function localGranger(input: GrangerInput): GrangerResult;
/** Local fallback: Volatility calculation */
declare function localVolatility(input: VolatilityInput): VolatilityResult;
/** Local fallback: Correlation matrix */
declare function localCorrelationMatrix(input: CorrelationMatrixInput): CorrelationMatrixResult;
/** Main analyzer */
export declare const analyzer: {
    calculateCorrelation(input: CorrelationInput, options?: {
        useCache?: boolean;
        deepAnalysis?: boolean;
    }): Promise<CorrelationResult>;
    performPCA(input: PCAInput, options?: {
        useCache?: boolean;
        deepAnalysis?: boolean;
    }): Promise<PCAResult>;
    detectRegime(input: RegimeInput, options?: {
        useCache?: boolean;
        deepAnalysis?: boolean;
    }): Promise<RegimeResult>;
    testGrangerCausality(input: GrangerInput, options?: {
        useCache?: boolean;
        deepAnalysis?: boolean;
    }): Promise<GrangerResult>;
    calculateVolatility(input: VolatilityInput, options?: {
        useCache?: boolean;
        deepAnalysis?: boolean;
    }): Promise<VolatilityResult>;
    calculateCorrelationMatrix(input: CorrelationMatrixInput, options?: {
        useCache?: boolean;
        deepAnalysis?: boolean;
    }): Promise<CorrelationMatrixResult>;
};
export { localCorrelation, localPCA, localRegime, localGranger, localVolatility, localCorrelationMatrix };
//# sourceMappingURL=analyzer.d.ts.map
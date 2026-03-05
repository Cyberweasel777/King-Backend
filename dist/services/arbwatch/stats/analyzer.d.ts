/** ArbWatch DeepSeek Stats - Analyzer */
import { ImpliedProbabilityInput, ImpliedProbabilityResult, KellyCriterionInput, KellyCriterionResult, ArbitrageEVInput, ArbitrageEVResult, ArbitrageOpportunityInput, ArbitrageOpportunityResult, ArbDecayInput, ArbDecayResult } from './types';
/** Local fallback: Calculate implied probability */
declare function localImpliedProbability(input: ImpliedProbabilityInput): ImpliedProbabilityResult;
/** Local fallback: Kelly criterion */
declare function localKellyCriterion(input: KellyCriterionInput): KellyCriterionResult;
/** Local fallback: Arbitrage EV */
declare function localArbitrageEV(input: ArbitrageEVInput): ArbitrageEVResult;
/** Local fallback: Arbitrage opportunity */
declare function localArbitrageOpportunity(input: ArbitrageOpportunityInput): ArbitrageOpportunityResult;
/** Local fallback: Arb decay */
declare function localArbDecay(input: ArbDecayInput): ArbDecayResult;
/** Main analyzer functions */
export declare const analyzer: {
    /** Calculate implied probability from odds */
    calculateImpliedProbability(input: ImpliedProbabilityInput, options?: {
        useCache?: boolean;
        deepAnalysis?: boolean;
    }): Promise<ImpliedProbabilityResult>;
    /** Calculate Kelly criterion position sizing */
    calculateKellyCriterion(input: KellyCriterionInput, options?: {
        useCache?: boolean;
        deepAnalysis?: boolean;
    }): Promise<KellyCriterionResult>;
    /** Calculate arbitrage EV */
    calculateArbitrageEV(input: ArbitrageEVInput, options?: {
        useCache?: boolean;
        deepAnalysis?: boolean;
    }): Promise<ArbitrageEVResult>;
    /** Analyze arbitrage opportunity */
    analyzeArbitrageOpportunity(input: ArbitrageOpportunityInput, options?: {
        useCache?: boolean;
        deepAnalysis?: boolean;
    }): Promise<ArbitrageOpportunityResult>;
    /** Analyze arb decay pattern */
    analyzeArbDecay(input: ArbDecayInput, options?: {
        useCache?: boolean;
        deepAnalysis?: boolean;
    }): Promise<ArbDecayResult>;
};
export { localImpliedProbability, localKellyCriterion, localArbitrageEV, localArbitrageOpportunity, localArbDecay };
//# sourceMappingURL=analyzer.d.ts.map
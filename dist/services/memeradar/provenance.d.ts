import type { TokenData } from './types';
export type ProvenanceFactorName = 'Origin Verifiability' | 'Liquidity Genesis' | 'Holder Concentration' | 'Tokenomics Transparency' | 'Cross-Source Concordance' | 'Market Microstructure' | 'Code Provenance' | 'Governance Posture' | 'Time-Series Consistency' | 'Narrative Coherence';
export interface WeightedFactor {
    name: ProvenanceFactorName;
    weight: number;
    score: number;
    note: string;
}
export interface ProvenanceReport {
    score: number;
    confidence: number;
    factors: WeightedFactor[];
    topRiskFactors: WeightedFactor[];
    whyFlagged: string[];
}
export declare function buildProvenanceReport(token: TokenData): ProvenanceReport;
//# sourceMappingURL=provenance.d.ts.map
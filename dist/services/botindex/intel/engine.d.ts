/**
 * BotIndex DeepSeek Intelligence Engine
 *
 * Shared engine that takes raw market data from any domain and produces
 * AI-powered analysis: risk scores, signals, fair value estimates, reasoning.
 *
 * Pattern: raw data (free tier) → DeepSeek analysis (paid tier @ $0.05/call)
 * Economics: DeepSeek costs ~$0.002/call, we charge $0.05 = 25x margin.
 */
export type IntelSignal = 'BUY' | 'WATCH' | 'FADE' | 'HOLD';
export type RiskLevel = 'low' | 'medium' | 'high' | 'extreme';
export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';
export interface AssetIntel {
    id: string;
    name: string;
    symbol: string;
    signal: IntelSignal;
    confidence: number;
    riskScore: number;
    riskLevel: RiskLevel;
    fairValueEstimate: number | null;
    currentValue: number;
    valuationVerdict: 'undervalued' | 'overvalued' | 'fair' | 'insufficient_data';
    grade: Grade;
    reasoning: string;
    keyMetrics: Record<string, number | string>;
}
export interface IntelReport {
    domain: string;
    assets: AssetIntel[];
    marketSummary: string;
    topPick: string | null;
    source: 'deepseek' | 'error';
    model: string;
    analyzedAt: string;
    processingMs: number;
}
export type DomainConfig = {
    domain: string;
    systemPrompt: string;
    formatData: (rawData: any) => string;
};
export declare function generateIntelReport(config: DomainConfig, rawData: any): Promise<IntelReport>;
//# sourceMappingURL=engine.d.ts.map
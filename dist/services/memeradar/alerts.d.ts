import type { TokenData, TrendingToken } from './types';
export type AlertType = 'unlock_shock' | 'concentration' | 'liquidity_fragility' | 'narrative_mismatch' | 'data_divergence' | 'promotion_risk';
export interface AlertTelemetry {
    token: TokenData;
    unlock7dUsd?: number;
    unlock7dPctFloat?: number;
    top10HolderPct?: number;
    socialVelocitySigma?: number;
    onchainVelocitySigma?: number;
    divergencePct?: number;
    providersDiverged?: number;
    divergenceDurationMin?: number;
    hasPaidBoost?: boolean;
    holderDispersionScore?: number;
}
export interface TriggeredAlert {
    type: AlertType;
    severity: 'high' | 'critical';
    symbol: string;
    address: string;
    reason: string;
    timestamp: string;
}
export declare function evaluateAlerts(t: AlertTelemetry): TriggeredAlert[];
export interface DigestItem {
    symbol: string;
    address: string;
    score: number;
    scoreDelta: number;
    newAlerts: TriggeredAlert[];
}
export declare function buildDailyDigest(tokens: TrendingToken[], previousScores: Map<string, number>): DigestItem[];
//# sourceMappingURL=alerts.d.ts.map
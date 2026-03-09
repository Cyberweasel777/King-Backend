import type { DopplerAsset } from './client';
export type RiskTier = 'A' | 'B' | 'C' | 'D';
export interface ScoreFactors {
    liquidityDepthRatio: number;
    volumeVelocity: number;
    holdersPerHour: number;
    liquidityDepth: number;
    volumeMomentum: number;
    holderDistribution: number;
    feeDecayProtection: number;
    migrationMaturity: number;
    creatorReputation: number;
    repeatLauncher: boolean;
}
export interface ScoreCard {
    address: string;
    name: string | null;
    symbol: string | null;
    score: number;
    tier: RiskTier;
    factors: ScoreFactors;
}
export declare function scoreLaunch(asset: DopplerAsset): ScoreCard;
export declare function formatScoreCard(score: ScoreCard): {
    address: string;
    name: string | null;
    symbol: string | null;
    score: number;
    tier: RiskTier;
    factors: ScoreFactors;
};
export declare function enhanceWithNarrative(scores: ScoreCard[]): Promise<ScoreCard[]>;
//# sourceMappingURL=scorer.d.ts.map
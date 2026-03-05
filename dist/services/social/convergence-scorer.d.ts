/**
 * Convergence Scorer — Cross-signal scoring for social sentiment
 * Groups by token, weights by follower count, scores by velocity + breadth
 */
import type { SentimentResult } from './sentiment-analyzer';
export interface ConvergenceSignal {
    token: string;
    score: number;
    mentionCount: number;
    uniqueAccounts: number;
    sentiment: 'bullish' | 'bearish' | 'neutral' | 'mixed';
    avgConfidence: number;
    velocity: number;
    topMentioners: string[];
    updatedAt: string;
}
export declare function scoreConvergence(results: SentimentResult[]): ConvergenceSignal[];
//# sourceMappingURL=convergence-scorer.d.ts.map
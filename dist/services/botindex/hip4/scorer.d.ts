import { HIP4OutcomeMarket, HIP4Position, HIP4ScoreCard, HIP4SettlementSource } from './types';
export declare function scoreMarket(market: HIP4OutcomeMarket, _positions: HIP4Position[], settlement?: HIP4SettlementSource): HIP4ScoreCard;
export declare function formatScoreCard(score: HIP4ScoreCard): {
    marketId: string;
    score: number;
    tier: HIP4ScoreCard['tier'];
    factors: HIP4ScoreCard['factors'];
};
//# sourceMappingURL=scorer.d.ts.map
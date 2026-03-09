import { HIP6AuctionState, HIP6Bid, HIP6ClearingEvent, HIP6ScoreCard, ScoreTier } from './types';
export declare function scoreAuction(state: HIP6AuctionState, bids: HIP6Bid[], clearingEvents: HIP6ClearingEvent[]): HIP6ScoreCard;
export declare function formatScoreCard(score: HIP6ScoreCard): {
    auctionId: string;
    score: number;
    tier: ScoreTier;
    factors: HIP6ScoreCard['factors'];
};
//# sourceMappingURL=scorer.d.ts.map
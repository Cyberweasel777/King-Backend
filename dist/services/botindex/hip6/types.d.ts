export interface HIP6AuctionConfig {
    auctionId: string;
    tokenAddress: string;
    quoteAsset: 'USDH';
    durationBlocks: number;
    maxConcurrent: number;
    registrationFee: number;
    protocolFeeBps: number;
    liquiditySeedPercent: {
        min: number;
        max: number;
    };
}
export type BidStatus = 'PENDING' | 'ACTIVE' | 'CLEARED' | 'CANCELLED';
export interface HIP6Bid {
    bidId: string;
    auctionId: string;
    bidder: string;
    budget: number;
    maxPrice: number;
    activationBlock: number;
    status: BidStatus;
}
export interface HIP6ClearingEvent {
    blockNumber: number;
    auctionId: string;
    clearingPrice: number;
    volumeCleared: number;
    bidsMatched: number;
}
export declare enum AuctionStatus {
    REGISTERED = "REGISTERED",
    ACTIVE = "ACTIVE",
    CLEARING = "CLEARING",
    SETTLED = "SETTLED",
    CLAIMING = "CLAIMING"
}
export interface HIP6AuctionState {
    auctionId: string;
    status: AuctionStatus;
    currentBlock: number;
    totalBids: number;
    totalVolume: number;
    vwapPrice: number;
    seedPrice: number;
}
export type ScoreTier = 'A' | 'B' | 'C' | 'D';
export interface HIP6ScoreCard {
    auctionId: string;
    score: number;
    tier: ScoreTier;
    factors: {
        bidConcentration: number;
        priceStability: number;
        volumeVelocity: number;
        participantDiversity: number;
        liquiditySeedRatio: number;
    };
}
//# sourceMappingURL=types.d.ts.map
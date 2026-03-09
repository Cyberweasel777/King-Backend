import { HIP6AuctionState, HIP6Bid, HIP6ClearingEvent } from './types';
export declare class HIP6Client {
    private readonly cache;
    isLive(): boolean;
    getActiveAuctions(): Promise<HIP6AuctionState[]>;
    getAuctionDetails(auctionId: string): Promise<HIP6AuctionState | null>;
    getAuctionBids(auctionId: string): Promise<HIP6Bid[]>;
    getClearingHistory(auctionId: string, limit?: number): Promise<HIP6ClearingEvent[]>;
    private getFromCache;
    private setCache;
}
export declare const hip6Client: HIP6Client;
//# sourceMappingURL=client.d.ts.map
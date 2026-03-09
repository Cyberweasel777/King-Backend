import { HIP4OutcomeContract, HIP4OutcomeMarket, HIP4Position, HIP4SettlementSource } from './types';
export declare class HIP4Client {
    private readonly cache;
    isLive(): boolean;
    getActiveMarkets(): Promise<HIP4OutcomeMarket[]>;
    getMarketDetails(marketId: string): Promise<HIP4OutcomeMarket | null>;
    getPositions(marketId: string): Promise<HIP4Position[]>;
    getSettlementStatus(marketId: string): Promise<{
        source: HIP4SettlementSource | null;
        contract: HIP4OutcomeContract | null;
    }>;
    private getFromCache;
    private setCache;
}
export declare const hip4Client: HIP4Client;
//# sourceMappingURL=client.d.ts.map
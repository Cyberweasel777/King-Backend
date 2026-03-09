export declare enum HIP4Status {
    PENDING = "PENDING",
    ACTIVE = "ACTIVE",
    SETTLED = "SETTLED",
    EXPIRED = "EXPIRED"
}
export declare enum HIP4SettlementType {
    ORACLE = "ORACLE",
    MANUAL = "MANUAL",
    ONCHAIN = "ONCHAIN"
}
export interface HIP4OutcomeContract {
    contractId: string;
    underlying: string;
    settlementRange: {
        min: number;
        max: number;
    };
    expiryTimestamp: number;
    collateralAsset: "USDC" | "USDH";
    settlementSource: string;
    status: HIP4Status;
}
export interface HIP4OutcomeMarket {
    marketId: string;
    contractId: string;
    title: string;
    description: string;
    yesPrice: number;
    noPrice: number;
    totalVolume: number;
    openInterest: number;
    createdAt: number;
    expiryAt: number;
    settled: boolean;
    settlementValue?: number;
}
export interface HIP4SettlementSource {
    sourceId: string;
    type: HIP4SettlementType;
    provider: string;
    endpoint?: string;
    lastUpdate: number;
    reliability: number;
}
export interface HIP4Position {
    positionId: string;
    marketId: string;
    side: "YES" | "NO";
    size: number;
    entryPrice: number;
    currentPrice: number;
    pnl: number;
    holder: string;
}
export interface HIP4ScoreCard {
    marketId: string;
    score: number;
    tier: "A" | "B" | "C" | "D";
    factors: {
        marketLiquidity: number;
        settlementClarity: number;
        participationBalance: number;
        timeToExpiry: number;
        priceEfficiency: number;
    };
}
//# sourceMappingURL=types.d.ts.map
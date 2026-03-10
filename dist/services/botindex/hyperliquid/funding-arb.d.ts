export type FundingArbOpportunity = {
    symbol: string;
    hlFundingRate: number;
    binanceFundingRate: number;
    spread: number;
    annualizedYield: number;
    direction: 'long_hl_short_binance' | 'short_hl_long_binance' | 'neutral';
};
export type FundingArbResponse = {
    opportunities: FundingArbOpportunity[];
    note?: string;
};
export declare function getFundingArbOpportunities(): Promise<FundingArbResponse>;
//# sourceMappingURL=funding-arb.d.ts.map
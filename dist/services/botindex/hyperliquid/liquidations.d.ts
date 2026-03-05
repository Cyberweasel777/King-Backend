export type LiquidationHeatmapRow = {
    symbol: string;
    priceLevel: number;
    longLiquidations: number;
    shortLiquidations: number;
    totalNotional: number;
};
export type LiquidationHeatmapResponse = {
    heatmap: LiquidationHeatmapRow[];
};
export declare function getLiquidationHeatmap(): Promise<LiquidationHeatmapResponse>;
//# sourceMappingURL=liquidations.d.ts.map
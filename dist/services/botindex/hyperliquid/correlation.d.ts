export type HLCorrelationMatrixResponse = {
    matrix: Record<string, Record<string, number>>;
    timestamp: string;
};
export declare function getHLCorrelationMatrix(): Promise<HLCorrelationMatrixResponse>;
//# sourceMappingURL=correlation.d.ts.map
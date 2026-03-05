export type AttentionTrend = {
    coinAddress: string;
    topic: string;
    velocityScore: number;
    volume1h: number;
    volumeChange: number;
    direction: 'up' | 'down' | 'flat';
};
export type AttentionMomentumResponse = {
    trends: AttentionTrend[];
};
export declare function getAttentionMomentum(limit: number): Promise<AttentionMomentumResponse>;
//# sourceMappingURL=attention.d.ts.map
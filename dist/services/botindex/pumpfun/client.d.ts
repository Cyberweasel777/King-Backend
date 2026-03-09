import type { PumpfunToken, PumpfunGraduation, PumpfunRugScore } from './types';
export declare function getGraduatingTokens(): Promise<PumpfunToken[]>;
export declare function getRecentGraduations(limit?: number): Promise<PumpfunGraduation[]>;
export declare function getRugScore(mintAddress: string): Promise<PumpfunRugScore>;
//# sourceMappingURL=client.d.ts.map
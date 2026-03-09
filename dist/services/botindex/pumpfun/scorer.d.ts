import type { PumpfunRugScore } from './types';
export interface PumpfunRiskInputs {
    mintAddress: string;
    topHolderConcentration: number;
    devWalletSold: boolean;
    devWalletSoldPercent?: number;
    suspiciousDevPattern?: boolean;
    liquidityLocked: boolean;
    liquidityLockDays?: number;
    socialRiskFlags?: number;
    socialTrustScore?: number;
    washTradingIndex?: number;
    buySellRatio?: number;
}
export declare function scorePumpfunRug(inputs: PumpfunRiskInputs): PumpfunRugScore;
//# sourceMappingURL=scorer.d.ts.map
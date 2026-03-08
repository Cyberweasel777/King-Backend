export interface PumpfunToken {
  mintAddress: string;
  name: string;
  symbol: string;
  description: string;
  imageUri: string;
  creatorAddress: string;
  createdAt: string;
  marketCap: number;
  bondingCurveProgress: number;
  isGraduated: boolean;
  graduatedAt: string | null;
  raydiumPoolAddress: string | null;
}

export interface PumpfunGraduation {
  token: PumpfunToken;
  graduationTimestamp: string;
  initialLiquidity: number;
  currentLiquidity: number;
  holderCount: number;
  topHolderConcentration: number;
  devWalletSold: boolean;
  rugScore: number;
}

export interface PumpfunRugScore {
  mint: string;
  rugScore: number;
  factors: {
    holderConcentration: number;
    devWalletActivity: number;
    liquidityLocked: number;
    socialSignals: number;
    tradingPattern: number;
  };
}

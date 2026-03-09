"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGraduatingTokens = getGraduatingTokens;
exports.getRecentGraduations = getRecentGraduations;
exports.getRugScore = getRugScore;
const scorer_1 = require("./scorer");
const logger_1 = __importDefault(require("../../../config/logger"));
const PUMPFUN_LIVE = process.env.PUMPFUN_LIVE === 'true';
const CACHE_TTL_MS = 60_000;
let graduatingCache = null;
let graduatedCache = null;
const rugScoreCache = new Map();
function isFresh(entry) {
    return !!entry && Date.now() - entry.timestamp < CACHE_TTL_MS;
}
// --- Stub data for scaffold mode ---
const STUB_TOKENS = [
    {
        mintAddress: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
        name: 'Bonk Inu v2',
        symbol: 'BONK2',
        description: 'Community dog token on Solana',
        imageUri: 'https://pump.fun/img/bonk2.png',
        creatorAddress: '3nMFwZXwY1s1M5s8vYAHqd4wGs4iSxUKt7eAqUP6TVgN',
        createdAt: new Date(Date.now() - 3_600_000).toISOString(),
        marketCap: 68_000,
        bondingCurveProgress: 87,
        isGraduated: false,
        graduatedAt: null,
        raydiumPoolAddress: null,
    },
    {
        mintAddress: '9DT7WMK3FQc8b3yj2c33qt3S7CTfkQzA4zr48GFgFray',
        name: 'Candy Crew',
        symbol: 'CAND',
        description: 'Sweet rewards token backed by NxGen Brands',
        imageUri: 'https://pump.fun/img/cand.png',
        creatorAddress: 'CaNd1eXAiNs3bRaNds7777777777777777777777777',
        createdAt: new Date(Date.now() - 7_200_000).toISOString(),
        marketCap: 42_000,
        bondingCurveProgress: 92,
        isGraduated: false,
        graduatedAt: null,
        raydiumPoolAddress: null,
    },
    {
        mintAddress: 'FakE1111111111111111111111111111111111111111',
        name: 'SolCat',
        symbol: 'SCAT',
        description: 'The cat that codes on Solana',
        imageUri: 'https://pump.fun/img/scat.png',
        creatorAddress: 'DevW4llet1111111111111111111111111111111111',
        createdAt: new Date(Date.now() - 1_800_000).toISOString(),
        marketCap: 71_500,
        bondingCurveProgress: 95,
        isGraduated: false,
        graduatedAt: null,
        raydiumPoolAddress: null,
    },
];
const STUB_GRADUATIONS = [
    {
        token: {
            ...STUB_TOKENS[0],
            isGraduated: true,
            graduatedAt: new Date(Date.now() - 600_000).toISOString(),
            bondingCurveProgress: 100,
            raydiumPoolAddress: 'RayP00l111111111111111111111111111111111111',
        },
        graduationTimestamp: new Date(Date.now() - 600_000).toISOString(),
        initialLiquidity: 85_000,
        currentLiquidity: 72_000,
        holderCount: 342,
        topHolderConcentration: 28,
        devWalletSold: false,
        rugScore: 32,
    },
    {
        token: {
            mintAddress: 'RuGG3d1111111111111111111111111111111111111',
            name: 'MoonShotX',
            symbol: 'MSX',
            description: 'To the moon and beyond',
            imageUri: 'https://pump.fun/img/msx.png',
            creatorAddress: 'SuS1Dev1111111111111111111111111111111111',
            createdAt: new Date(Date.now() - 14_400_000).toISOString(),
            marketCap: 12_000,
            bondingCurveProgress: 100,
            isGraduated: true,
            graduatedAt: new Date(Date.now() - 1_200_000).toISOString(),
            raydiumPoolAddress: 'RayP00l222222222222222222222222222222222222',
        },
        graduationTimestamp: new Date(Date.now() - 1_200_000).toISOString(),
        initialLiquidity: 95_000,
        currentLiquidity: 8_000,
        holderCount: 47,
        topHolderConcentration: 72,
        devWalletSold: true,
        rugScore: 88,
    },
    {
        token: {
            mintAddress: 'Sa4Fe1111111111111111111111111111111111111',
            name: 'BuilderDAO',
            symbol: 'BLDR',
            description: 'Community governed builder fund',
            imageUri: 'https://pump.fun/img/bldr.png',
            creatorAddress: 'G00dDev1111111111111111111111111111111111',
            createdAt: new Date(Date.now() - 86_400_000).toISOString(),
            marketCap: 245_000,
            bondingCurveProgress: 100,
            isGraduated: true,
            graduatedAt: new Date(Date.now() - 3_600_000).toISOString(),
            raydiumPoolAddress: 'RayP00l333333333333333333333333333333333333',
        },
        graduationTimestamp: new Date(Date.now() - 3_600_000).toISOString(),
        initialLiquidity: 120_000,
        currentLiquidity: 185_000,
        holderCount: 1_247,
        topHolderConcentration: 15,
        devWalletSold: false,
        rugScore: 12,
    },
];
// --- Public API ---
async function getGraduatingTokens() {
    if (isFresh(graduatingCache))
        return graduatingCache.data;
    if (!PUMPFUN_LIVE) {
        logger_1.default.info('[pumpfun] stub mode — returning mock graduating tokens');
        const data = STUB_TOKENS.filter(t => t.bondingCurveProgress >= 80);
        graduatingCache = { data, timestamp: Date.now() };
        return data;
    }
    // Live mode: connect to PumpPortal WebSocket for real data
    // TODO: implement live PumpPortal + Bitquery integration
    logger_1.default.warn('[pumpfun] live mode not yet implemented — returning empty');
    return [];
}
async function getRecentGraduations(limit = 10) {
    if (isFresh(graduatedCache))
        return graduatedCache.data.slice(0, limit);
    if (!PUMPFUN_LIVE) {
        logger_1.default.info('[pumpfun] stub mode — returning mock graduations');
        graduatedCache = { data: STUB_GRADUATIONS, timestamp: Date.now() };
        return STUB_GRADUATIONS.slice(0, limit);
    }
    logger_1.default.warn('[pumpfun] live mode not yet implemented — returning empty');
    return [];
}
async function getRugScore(mintAddress) {
    const cached = rugScoreCache.get(mintAddress);
    if (isFresh(cached))
        return cached.data;
    if (!PUMPFUN_LIVE) {
        logger_1.default.info(`[pumpfun] stub mode — returning mock rug score for ${mintAddress}`);
        const stubGrad = STUB_GRADUATIONS.find(g => g.token.mintAddress === mintAddress);
        const score = (0, scorer_1.scorePumpfunRug)({
            mintAddress,
            topHolderConcentration: stubGrad?.topHolderConcentration ?? 45,
            devWalletSold: stubGrad?.devWalletSold ?? false,
            devWalletSoldPercent: stubGrad?.devWalletSold ? 35 : 0,
            liquidityLocked: !stubGrad?.devWalletSold,
            liquidityLockDays: stubGrad?.devWalletSold ? 0 : 90,
            socialRiskFlags: stubGrad?.topHolderConcentration && stubGrad.topHolderConcentration > 50 ? 3 : 0,
            washTradingIndex: stubGrad?.topHolderConcentration && stubGrad.topHolderConcentration > 50 ? 60 : 15,
            buySellRatio: stubGrad?.devWalletSold ? 0.3 : 1.2,
        });
        rugScoreCache.set(mintAddress, { data: score, timestamp: Date.now() });
        return score;
    }
    logger_1.default.warn(`[pumpfun] live mode not yet implemented for ${mintAddress}`);
    return (0, scorer_1.scorePumpfunRug)({
        mintAddress,
        topHolderConcentration: 50,
        devWalletSold: false,
        liquidityLocked: false,
    });
}
//# sourceMappingURL=client.js.map
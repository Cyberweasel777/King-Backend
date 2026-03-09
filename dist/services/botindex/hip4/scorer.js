"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scoreMarket = scoreMarket;
exports.formatScoreCard = formatScoreCard;
const types_1 = require("./types");
const WEIGHTS = {
    marketLiquidity: 0.25,
    settlementClarity: 0.25,
    participationBalance: 0.2,
    timeToExpiry: 0.15,
    priceEfficiency: 0.15,
};
function clamp(value, min = 0, max = 1) {
    return Math.min(max, Math.max(min, value));
}
function round(value, decimals = 4) {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
}
function toEpochMs(timestamp) {
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
        return 0;
    }
    return timestamp > 10_000_000_000 ? timestamp : timestamp * 1000;
}
function toTier(score) {
    if (score >= 80)
        return 'A';
    if (score >= 65)
        return 'B';
    if (score >= 50)
        return 'C';
    return 'D';
}
function scoreMarketLiquidity(market) {
    const openInterest = Math.max(0, market.openInterest);
    const totalVolume = Math.max(0, market.totalVolume);
    if (totalVolume <= 0) {
        return 0;
    }
    const ratio = openInterest / totalVolume;
    const bounded = clamp(ratio, 0.1, 2.0);
    return clamp((bounded - 0.1) / 1.9);
}
function scoreSettlementClarity(settlement) {
    if (!settlement) {
        return 0.3;
    }
    const reliability = clamp(settlement.reliability);
    let score = reliability > 0.8 ? 1 : reliability;
    if (settlement.type === types_1.HIP4SettlementType.MANUAL) {
        score = Math.min(score, 0.7);
    }
    else if (settlement.type === types_1.HIP4SettlementType.ONCHAIN) {
        score = Math.max(score, 0.8);
    }
    return clamp(score);
}
function scoreParticipationBalance(market) {
    const yesPrice = clamp(market.yesPrice, 0, 1);
    if (yesPrice <= 0.05 || yesPrice >= 0.95) {
        return 0.1;
    }
    const distanceFromMid = Math.abs(yesPrice - 0.5);
    return clamp(1 - distanceFromMid / 0.5);
}
function scoreTimeToExpiry(market) {
    const expiryMs = toEpochMs(market.expiryAt);
    if (expiryMs <= 0) {
        return 0;
    }
    const msUntilExpiry = expiryMs - Date.now();
    const daysUntilExpiry = msUntilExpiry / (24 * 60 * 60 * 1000);
    if (!Number.isFinite(daysUntilExpiry) || daysUntilExpiry <= 0) {
        return 0;
    }
    if (daysUntilExpiry < 1) {
        return 0.3;
    }
    if (daysUntilExpiry < 2) {
        return 0.3 + 0.7 * (daysUntilExpiry - 1);
    }
    if (daysUntilExpiry <= 30) {
        return 1;
    }
    if (daysUntilExpiry <= 90) {
        return 1 - ((daysUntilExpiry - 30) / 60) * 0.5;
    }
    return 0.5;
}
function scorePriceEfficiency(market) {
    const yes = clamp(market.yesPrice, 0, 1);
    const no = clamp(market.noPrice, 0, 1);
    const deviation = Math.abs(yes + no - 1);
    return clamp(1 - deviation / 0.25);
}
function scoreMarket(market, _positions, settlement) {
    const factors = {
        marketLiquidity: round(scoreMarketLiquidity(market)),
        settlementClarity: round(scoreSettlementClarity(settlement)),
        participationBalance: round(scoreParticipationBalance(market)),
        timeToExpiry: round(scoreTimeToExpiry(market)),
        priceEfficiency: round(scorePriceEfficiency(market)),
    };
    const weightedScore = factors.marketLiquidity * WEIGHTS.marketLiquidity +
        factors.settlementClarity * WEIGHTS.settlementClarity +
        factors.participationBalance * WEIGHTS.participationBalance +
        factors.timeToExpiry * WEIGHTS.timeToExpiry +
        factors.priceEfficiency * WEIGHTS.priceEfficiency;
    const score = Math.round(clamp(weightedScore) * 100);
    return {
        marketId: market.marketId,
        score,
        tier: toTier(score),
        factors,
    };
}
function formatScoreCard(score) {
    return {
        marketId: score.marketId,
        score: score.score,
        tier: score.tier,
        factors: score.factors,
    };
}
//# sourceMappingURL=scorer.js.map
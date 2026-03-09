"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scorePumpfunRug = scorePumpfunRug;
const WEIGHTS = {
    holderConcentration: 0.3,
    devWalletActivity: 0.25,
    liquidityLocked: 0.2,
    socialSignals: 0.15,
    tradingPattern: 0.1,
};
function clamp(value, min = 0, max = 100) {
    if (!Number.isFinite(value)) {
        return min;
    }
    return Math.min(max, Math.max(min, value));
}
function round(value, decimals = 2) {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
}
function holderConcentrationSafety(topHolderConcentration) {
    const concentration = clamp(topHolderConcentration, 0, 100);
    // Requested calibration: >60% => 0, <20% => 100.
    if (concentration >= 60) {
        return 0;
    }
    if (concentration <= 20) {
        return 100;
    }
    return ((60 - concentration) / 40) * 100;
}
function scoreHolderConcentrationRisk(topHolderConcentration) {
    const safety = holderConcentrationSafety(topHolderConcentration);
    return clamp(100 - safety);
}
function scoreDevWalletActivityRisk(inputs) {
    const soldPercent = clamp(inputs.devWalletSoldPercent ?? 0, 0, 100);
    let risk = 20;
    if (inputs.devWalletSold) {
        if (soldPercent >= 50) {
            risk = 100;
        }
        else if (soldPercent >= 25) {
            risk = 85;
        }
        else if (soldPercent >= 10) {
            risk = 70;
        }
        else if (soldPercent > 0) {
            risk = 55;
        }
        else {
            risk = 65;
        }
    }
    if (inputs.suspiciousDevPattern) {
        risk += 15;
    }
    return clamp(risk);
}
function scoreLiquidityLockedRisk(inputs) {
    if (!inputs.liquidityLocked) {
        return 95;
    }
    const lockDays = clamp(inputs.liquidityLockDays ?? 0, 0, 3650);
    if (lockDays >= 365)
        return 5;
    if (lockDays >= 180)
        return 15;
    if (lockDays >= 90)
        return 30;
    if (lockDays >= 30)
        return 50;
    if (lockDays > 0)
        return 65;
    return 75;
}
function scoreSocialSignalsRisk(inputs) {
    const flags = Math.max(0, Math.floor(inputs.socialRiskFlags ?? 0));
    if (flags >= 4)
        return 100;
    if (flags === 3)
        return 85;
    if (flags === 2)
        return 70;
    if (flags === 1)
        return 55;
    const trust = inputs.socialTrustScore;
    if (trust === undefined || !Number.isFinite(trust)) {
        return 40;
    }
    return clamp(100 - trust);
}
function scoreBuySellAnomalyRisk(buySellRatio) {
    const ratio = Number.isFinite(buySellRatio) && buySellRatio > 0 ? buySellRatio : 1;
    const centeredDistance = Math.abs(Math.log(ratio));
    return clamp((centeredDistance / Math.log(5)) * 100);
}
function scoreTradingPatternRisk(inputs) {
    const washTrading = clamp(inputs.washTradingIndex ?? 40);
    const buySellAnomaly = scoreBuySellAnomalyRisk(inputs.buySellRatio ?? 1);
    return clamp(washTrading * 0.7 + buySellAnomaly * 0.3);
}
function scorePumpfunRug(inputs) {
    const factors = {
        holderConcentration: round(scoreHolderConcentrationRisk(inputs.topHolderConcentration)),
        devWalletActivity: round(scoreDevWalletActivityRisk(inputs)),
        liquidityLocked: round(scoreLiquidityLockedRisk(inputs)),
        socialSignals: round(scoreSocialSignalsRisk(inputs)),
        tradingPattern: round(scoreTradingPatternRisk(inputs)),
    };
    const weighted = factors.holderConcentration * WEIGHTS.holderConcentration +
        factors.devWalletActivity * WEIGHTS.devWalletActivity +
        factors.liquidityLocked * WEIGHTS.liquidityLocked +
        factors.socialSignals * WEIGHTS.socialSignals +
        factors.tradingPattern * WEIGHTS.tradingPattern;
    return {
        mint: inputs.mintAddress,
        rugScore: round(clamp(weighted), 2),
        factors,
    };
}
//# sourceMappingURL=scorer.js.map
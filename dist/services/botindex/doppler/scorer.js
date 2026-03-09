"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scoreLaunch = scoreLaunch;
exports.formatScoreCard = formatScoreCard;
exports.enhanceWithNarrative = enhanceWithNarrative;
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
function round(value, decimals) {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
}
function scoreLiquidityDepthRatio(liquidityDepthRatio) {
    if (liquidityDepthRatio >= 0.35)
        return 25;
    if (liquidityDepthRatio >= 0.2)
        return 21;
    if (liquidityDepthRatio >= 0.12)
        return 16;
    if (liquidityDepthRatio >= 0.06)
        return 10;
    if (liquidityDepthRatio > 0)
        return 5;
    return 1;
}
function scoreVolumeMomentum(volumeVelocity) {
    if (volumeVelocity >= 200_000)
        return 20;
    if (volumeVelocity >= 80_000)
        return 16;
    if (volumeVelocity >= 30_000)
        return 12;
    if (volumeVelocity >= 8_000)
        return 8;
    if (volumeVelocity >= 2_000)
        return 5;
    return 2;
}
function scoreHolderDistribution(holdersPerHour) {
    if (holdersPerHour >= 300)
        return 3;
    if (holdersPerHour >= 150)
        return 7;
    if (holdersPerHour >= 50)
        return 14;
    if (holdersPerHour >= 20)
        return 16;
    if (holdersPerHour >= 5)
        return 11;
    return 6;
}
function scoreCreatorReputation(creatorLaunchCount) {
    if (creatorLaunchCount >= 25)
        return { score: 2, repeatLauncher: true };
    if (creatorLaunchCount >= 10)
        return { score: 5, repeatLauncher: true };
    if (creatorLaunchCount >= 4)
        return { score: 9, repeatLauncher: false };
    if (creatorLaunchCount >= 1)
        return { score: 12, repeatLauncher: false };
    return { score: 8, repeatLauncher: false };
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
function scoreLaunch(asset) {
    const liquidityDepthRatio = asset.marketCapUsd > 0 ? asset.liquidityUsd / asset.marketCapUsd : 0;
    const volumeVelocity = asset.dayVolumeUsd / Math.max(1, asset.ageHours);
    const holdersPerHour = asset.holderCount / Math.max(1, asset.ageHours);
    const liquidityDepth = scoreLiquidityDepthRatio(liquidityDepthRatio);
    const volumeMomentum = scoreVolumeMomentum(volumeVelocity);
    const holderDistribution = scoreHolderDistribution(holdersPerHour);
    const feeDecayProtection = asset.sniperProtectionEnabled ? 10 : 4;
    const migrationMaturity = asset.migrated ? 10 : 4;
    const creatorReputationScored = scoreCreatorReputation(asset.creatorLaunchCount);
    const totalScore = clamp(liquidityDepth +
        volumeMomentum +
        holderDistribution +
        feeDecayProtection +
        migrationMaturity +
        creatorReputationScored.score, 0, 100);
    const score = Math.round(totalScore);
    return {
        address: asset.address,
        name: asset.name,
        symbol: asset.symbol,
        score,
        tier: toTier(score),
        factors: {
            liquidityDepthRatio: round(liquidityDepthRatio, 4),
            volumeVelocity: round(volumeVelocity, 2),
            holdersPerHour: round(holdersPerHour, 2),
            liquidityDepth,
            volumeMomentum,
            holderDistribution,
            feeDecayProtection,
            migrationMaturity,
            creatorReputation: creatorReputationScored.score,
            repeatLauncher: creatorReputationScored.repeatLauncher,
        },
    };
}
function formatScoreCard(score) {
    return {
        address: score.address,
        name: score.name,
        symbol: score.symbol,
        score: score.score,
        tier: score.tier,
        factors: score.factors,
    };
}
async function enhanceWithNarrative(scores) {
    const deepseekApiKey = process.env.DEEPSEEK_API_KEY;
    if (!deepseekApiKey) {
        return scores;
    }
    // TODO: Plug in DeepSeek narrative generation here and append narrative fields to each score card.
    // Keep this function side-effect free: accept score cards in, return enriched score cards out.
    return scores;
}
//# sourceMappingURL=scorer.js.map
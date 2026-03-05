"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateAlerts = evaluateAlerts;
exports.buildDailyDigest = buildDailyDigest;
const provenance_1 = require("./provenance");
function evaluateAlerts(t) {
    const out = [];
    const token = t.token;
    const createdAt = token.metadata?.createdAt ? new Date(token.metadata.createdAt).getTime() : 0;
    const ageHours = createdAt > 0 ? (Date.now() - createdAt) / 3600000 : 999;
    if ((t.unlock7dUsd ?? 0) > 5_000_000 || (t.unlock7dPctFloat ?? 0) > 2) {
        out.push({
            type: 'unlock_shock', severity: 'critical', symbol: token.symbol, address: token.address,
            reason: `Unlock shock: 7d unlock ${(t.unlock7dUsd || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })} / ${(t.unlock7dPctFloat || 0).toFixed(2)}% float.`,
            timestamp: new Date().toISOString(),
        });
    }
    if ((t.top10HolderPct ?? 0) > 75) {
        out.push({
            type: 'concentration', severity: 'high', symbol: token.symbol, address: token.address,
            reason: `Concentration warning: top-10 holders control ${(t.top10HolderPct || 0).toFixed(1)}%.`,
            timestamp: new Date().toISOString(),
        });
    }
    if (ageHours < 24 && (token.liquidityUsd || 0) < 250_000) {
        out.push({
            type: 'liquidity_fragility', severity: 'critical', symbol: token.symbol, address: token.address,
            reason: `Liquidity fragility: LP age ${ageHours.toFixed(1)}h and liquidity ${token.liquidityUsd.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}.`,
            timestamp: new Date().toISOString(),
        });
    }
    if ((t.socialVelocitySigma ?? 0) > 3 && (t.onchainVelocitySigma ?? 0) < 1) {
        out.push({
            type: 'narrative_mismatch', severity: 'high', symbol: token.symbol, address: token.address,
            reason: `Narrative mismatch: social ${(t.socialVelocitySigma || 0).toFixed(1)}σ vs on-chain ${(t.onchainVelocitySigma || 0).toFixed(1)}σ.`,
            timestamp: new Date().toISOString(),
        });
    }
    if ((t.divergencePct ?? 0) > 4 && (t.providersDiverged ?? 0) >= 2 && (t.divergenceDurationMin ?? 0) >= 30) {
        out.push({
            type: 'data_divergence', severity: 'high', symbol: token.symbol, address: token.address,
            reason: `Data divergence: ${(t.divergencePct || 0).toFixed(2)}% across ${t.providersDiverged} providers for ${t.divergenceDurationMin}m.`,
            timestamp: new Date().toISOString(),
        });
    }
    if (t.hasPaidBoost && (t.holderDispersionScore ?? 100) < 35) {
        out.push({
            type: 'promotion_risk', severity: 'high', symbol: token.symbol, address: token.address,
            reason: `Promotion risk: active paid boost with low holder dispersion score ${(t.holderDispersionScore || 0).toFixed(1)}.`,
            timestamp: new Date().toISOString(),
        });
    }
    return out;
}
function buildDailyDigest(tokens, previousScores) {
    return tokens.map((t) => {
        const report = (0, provenance_1.buildProvenanceReport)(t.token);
        const prev = previousScores.get(t.token.address) ?? report.score;
        const telemetry = {
            token: t.token,
            hasPaidBoost: (t.boostCount || 0) > 0,
            holderDispersionScore: t.token.holders > 3000 ? 60 : 28,
        };
        const newAlerts = evaluateAlerts(telemetry);
        return {
            symbol: t.token.symbol,
            address: t.token.address,
            score: report.score,
            scoreDelta: report.score - prev,
            newAlerts,
        };
    }).sort((a, b) => {
        const aRisk = a.newAlerts.length * 20 - a.score;
        const bRisk = b.newAlerts.length * 20 - b.score;
        return bRisk - aRisk;
    });
}
//# sourceMappingURL=alerts.js.map
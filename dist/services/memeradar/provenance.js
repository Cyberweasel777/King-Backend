"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildProvenanceReport = buildProvenanceReport;
const WEIGHTS = {
    'Origin Verifiability': 20,
    'Liquidity Genesis': 15,
    'Holder Concentration': 12,
    'Tokenomics Transparency': 12,
    'Cross-Source Concordance': 10,
    'Market Microstructure': 8,
    'Code Provenance': 8,
    'Governance Posture': 5,
    'Time-Series Consistency': 5,
    'Narrative Coherence': 5,
};
function clamp(v, min = 0, max = 100) {
    return Math.max(min, Math.min(max, v));
}
function ageHours(token) {
    const created = token.metadata?.createdAt;
    if (!created)
        return 999;
    const ms = Date.now() - new Date(created).getTime();
    return ms > 0 ? ms / 3600000 : 0;
}
function buildProvenanceReport(token) {
    const hours = ageHours(token);
    const liquidity = token.liquidityUsd || 0;
    const volume = token.volume24h || 0;
    const warnings = token.metadata?.warnings || [];
    const absMove = Math.abs(token.priceChange24h || 0);
    const origin = clamp((token.metadata?.creator ? 80 : 35) +
        (warnings.includes('missing_liquidity') ? -20 : 0) +
        (warnings.includes('missing_volume24h') ? -10 : 0));
    const liqGenesis = clamp((liquidity > 1_000_000 ? 85 : liquidity > 250_000 ? 65 : liquidity > 50_000 ? 45 : 25) +
        (hours < 24 ? -20 : 0));
    // Fallback when holder distribution unavailable from source.
    const holderConcentration = clamp(token.holders > 5000 ? 70 : token.holders > 1000 ? 55 : 40);
    const tokenomics = clamp((token.metadata?.mintAuthority ? 40 : 70) +
        (token.metadata?.freezeAuthority ? -20 : 0));
    const concordance = clamp(85 +
        (warnings.includes('missing_priceChange24h') ? -20 : 0) +
        (warnings.includes('missing_txns24h') ? -15 : 0));
    const microstructure = clamp((volume > 5_000_000 ? 80 : volume > 1_000_000 ? 70 : volume > 200_000 ? 55 : 40) +
        (absMove > 80 ? -20 : absMove > 40 ? -10 : 0));
    const codeProv = clamp(token.chain === 'solana' ? 55 : 60);
    const governance = clamp(50);
    const consistency = clamp(warnings.length >= 3 ? 40 : 70);
    const narrative = clamp(absMove > 120 ? 25 : absMove > 60 ? 45 : 70);
    const factors = [
        { name: 'Origin Verifiability', weight: WEIGHTS['Origin Verifiability'], score: origin, note: 'Issuer/source traceability' },
        { name: 'Liquidity Genesis', weight: WEIGHTS['Liquidity Genesis'], score: liqGenesis, note: 'Liquidity depth and pool age' },
        { name: 'Holder Concentration', weight: WEIGHTS['Holder Concentration'], score: holderConcentration, note: 'Distribution / holder concentration risk' },
        { name: 'Tokenomics Transparency', weight: WEIGHTS['Tokenomics Transparency'], score: tokenomics, note: 'Mint/freeze and token controls' },
        { name: 'Cross-Source Concordance', weight: WEIGHTS['Cross-Source Concordance'], score: concordance, note: 'Signal consistency across feeds' },
        { name: 'Market Microstructure', weight: WEIGHTS['Market Microstructure'], score: microstructure, note: 'Volume/liquidity behavior quality' },
        { name: 'Code Provenance', weight: WEIGHTS['Code Provenance'], score: codeProv, note: 'Contract/program provenance confidence' },
        { name: 'Governance Posture', weight: WEIGHTS['Governance Posture'], score: governance, note: 'Owner/governance centralization risk' },
        { name: 'Time-Series Consistency', weight: WEIGHTS['Time-Series Consistency'], score: consistency, note: 'Data continuity / anomaly risk' },
        { name: 'Narrative Coherence', weight: WEIGHTS['Narrative Coherence'], score: narrative, note: 'Narrative vs market behavior fit' },
    ];
    const score = Math.round(factors.reduce((sum, f) => sum + f.score * (f.weight / 100), 0));
    const topRiskFactors = [...factors].sort((a, b) => a.score - b.score).slice(0, 3);
    const whyFlagged = [];
    if (hours < 24 && liquidity < 250_000)
        whyFlagged.push('Liquidity fragility: LP <24h and liquidity under $250k.');
    if (absMove > 80)
        whyFlagged.push('Extreme 24h move indicates unstable microstructure.');
    if (warnings.length >= 2)
        whyFlagged.push('Data quality gaps detected across source fields.');
    if (token.metadata?.freezeAuthority)
        whyFlagged.push('Freeze authority present — elevated centralization risk.');
    const lowConfidenceSignals = [
        token.holders <= 0,
        warnings.length > 0,
        !token.metadata?.createdAt,
    ].filter(Boolean).length;
    const confidence = clamp(90 - lowConfidenceSignals * 15);
    return {
        score,
        confidence,
        factors,
        topRiskFactors,
        whyFlagged,
    };
}
//# sourceMappingURL=provenance.js.map
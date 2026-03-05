"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHip6LaunchCandidates = getHip6LaunchCandidates;
exports.getHip6FeedHistory = getHip6FeedHistory;
exports.ensureHip6Primed = ensureHip6Primed;
exports.getHip6AlertScores = getHip6AlertScores;
const logger_1 = __importDefault(require("../../../config/logger"));
const HL_INFO_URL = 'https://api.hyperliquid.xyz/info';
const CACHE_TTL_MS = 60 * 1000;
const HISTORY_LIMIT = 120;
const SNAPSHOT_TOP_N = 25;
let cache = null;
const history = [];
function asRecord(value) {
    if (typeof value !== 'object' || value === null)
        return null;
    return value;
}
function asNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value))
        return value;
    if (typeof value === 'string') {
        const parsed = Number.parseFloat(value);
        if (Number.isFinite(parsed))
            return parsed;
    }
    return null;
}
function asString(value) {
    if (typeof value !== 'string')
        return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
}
function round(value, decimals = 4) {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
}
async function postHyperliquidInfo(body) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
        const response = await fetch(HL_INFO_URL, {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        });
        if (!response.ok) {
            throw new Error(`Hyperliquid API returned ${response.status}`);
        }
        return (await response.json());
    }
    finally {
        clearTimeout(timeout);
    }
}
function readinessScore(dayNtlVlm, oi, fundingAbs) {
    const volumeScore = Math.min(100, Math.log10(Math.max(1, dayNtlVlm)) * 12);
    const oiScore = Math.min(100, Math.log10(Math.max(1, oi)) * 14);
    const imbalanceScore = Math.min(100, fundingAbs * 10000 * 2.5);
    return round(volumeScore * 0.45 + oiScore * 0.45 + imbalanceScore * 0.1, 2);
}
function getRationale(dayNtlVlm, oi, fundingRate) {
    const out = [];
    if (dayNtlVlm >= 10_000_000)
        out.push('high_24h_notional_volume');
    if (oi >= 5_000_000)
        out.push('high_open_interest');
    if (Math.abs(fundingRate) >= 0.0002)
        out.push('elevated_funding_imbalance');
    if (out.length === 0)
        out.push('baseline_liquidity_signal');
    return out;
}
function addSnapshot(candidates) {
    const top = candidates.slice(0, SNAPSHOT_TOP_N);
    const avg = top.length
        ? top.reduce((acc, c) => acc + c.launchReadinessScore, 0) / top.length
        : 0;
    const strongSignals = top.filter((c) => c.launchReadinessScore >= 60).length;
    history.unshift({
        generatedAt: new Date().toISOString(),
        topCandidates: top,
        breadth: {
            trackedSymbols: candidates.length,
            strongSignals,
            avgLaunchReadiness: round(avg, 2),
        },
    });
    if (history.length > HISTORY_LIMIT) {
        history.length = HISTORY_LIMIT;
    }
}
function severityFromAlertScore(score) {
    if (score >= 75)
        return 'alert';
    if (score >= 50)
        return 'watch';
    return 'info';
}
function computeAlertScore(scoreDelta, volumeDeltaPct, fundingDeltaBps, currentReadiness) {
    const scoreMomentum = Math.max(0, scoreDelta) * 0.7;
    const volumeMomentum = Math.max(0, volumeDeltaPct) * 0.2;
    const fundingMomentum = Math.min(50, Math.abs(fundingDeltaBps)) * 0.1;
    const base = currentReadiness * 0.35;
    return round(Math.min(100, base + scoreMomentum + volumeMomentum + fundingMomentum), 2);
}
async function getHip6LaunchCandidates(limit = 20) {
    const cacheKeyNow = Date.now();
    if (cache && cache.expiresAt > cacheKeyNow) {
        return {
            ...cache.data,
            candidates: cache.data.candidates.slice(0, limit),
        };
    }
    try {
        const payload = await postHyperliquidInfo({ type: 'metaAndAssetCtxs' });
        if (!Array.isArray(payload) || payload.length < 2) {
            throw new Error('Unexpected Hyperliquid metaAndAssetCtxs payload');
        }
        const meta = asRecord(payload[0]);
        const universe = meta && Array.isArray(meta.universe) ? meta.universe : [];
        const contexts = Array.isArray(payload[1]) ? payload[1] : [];
        const majors = new Set(['BTC', 'ETH', 'SOL']);
        const candidates = [];
        const maxLen = Math.min(universe.length, contexts.length);
        for (let i = 0; i < maxLen; i += 1) {
            const u = asRecord(universe[i]);
            const c = asRecord(contexts[i]);
            if (!u || !c)
                continue;
            const symbol = asString(u.name ?? u.coin ?? u.symbol)?.toUpperCase();
            if (!symbol || majors.has(symbol))
                continue;
            const dayNotionalVolume = asNumber(c.dayNtlVlm) ?? asNumber(c.dayNotionalVolume) ?? 0;
            const openInterest = asNumber(c.openInterest) ?? asNumber(c.oi) ?? 0;
            const fundingRate = asNumber(c.funding) ?? asNumber(c.fundingRate) ?? 0;
            const markPrice = asNumber(c.markPx) ?? asNumber(c.midPx) ?? 0;
            if (dayNotionalVolume <= 0 && openInterest <= 0)
                continue;
            candidates.push({
                symbol,
                markPrice: round(markPrice, 6),
                fundingRate: round(fundingRate, 8),
                dayNotionalVolume: round(dayNotionalVolume, 2),
                openInterest: round(openInterest, 2),
                launchReadinessScore: readinessScore(dayNotionalVolume, openInterest, Math.abs(fundingRate)),
                rationale: getRationale(dayNotionalVolume, openInterest, fundingRate),
            });
        }
        candidates.sort((a, b) => b.launchReadinessScore - a.launchReadinessScore);
        const data = {
            source: 'hyperliquid_metaAndAssetCtxs',
            generatedAt: new Date().toISOString(),
            methodology: 'Heuristic HIP-6 readiness ranking using Hyperliquid perp market structure (24h notional volume, open interest, funding imbalance). This is a signal layer, not an official HIP-6 auction feed.',
            candidates,
        };
        cache = { expiresAt: Date.now() + CACHE_TTL_MS, data };
        addSnapshot(candidates);
        return {
            ...data,
            candidates: data.candidates.slice(0, limit),
        };
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Failed to compute HIP-6 launch candidates');
        throw error;
    }
}
function getHip6FeedHistory(limit = 24) {
    const bounded = Math.max(1, Math.min(200, limit));
    return {
        source: 'in_memory_history',
        generatedAt: new Date().toISOString(),
        history: history.slice(0, bounded),
        note: 'History is in-memory and resets on app restart/deploy.',
    };
}
async function ensureHip6Primed() {
    if (history.length > 0)
        return;
    await getHip6LaunchCandidates(SNAPSHOT_TOP_N);
}
function getHip6AlertScores(limit = 20) {
    const bounded = Math.max(1, Math.min(100, limit));
    const latest = history[0];
    const previous = history[1];
    if (!latest) {
        return {
            source: 'derived_from_recent_history',
            generatedAt: new Date().toISOString(),
            lookbackSnapshots: history.length,
            alerts: [],
        };
    }
    const prevMap = new Map((previous?.topCandidates ?? []).map((c) => [c.symbol, c]));
    const alerts = latest.topCandidates.map((current) => {
        const prev = prevMap.get(current.symbol);
        const previousReadiness = prev?.launchReadinessScore ?? 0;
        const scoreDelta = current.launchReadinessScore - previousReadiness;
        const previousVolume = prev?.dayNotionalVolume ?? 0;
        const volumeDeltaPct = previousVolume > 0
            ? ((current.dayNotionalVolume - previousVolume) / previousVolume) * 100
            : (current.dayNotionalVolume > 0 ? 100 : 0);
        const previousFundingRate = prev?.fundingRate ?? 0;
        const fundingDeltaBps = (current.fundingRate - previousFundingRate) * 10_000;
        const alertScore = computeAlertScore(scoreDelta, volumeDeltaPct, fundingDeltaBps, current.launchReadinessScore);
        return {
            symbol: current.symbol,
            currentReadiness: current.launchReadinessScore,
            previousReadiness,
            scoreDelta: round(scoreDelta, 2),
            volumeDeltaPct: round(volumeDeltaPct, 2),
            fundingDeltaBps: round(fundingDeltaBps, 2),
            alertScore,
            severity: severityFromAlertScore(alertScore),
        };
    });
    alerts.sort((a, b) => b.alertScore - a.alertScore);
    return {
        source: 'derived_from_recent_history',
        generatedAt: new Date().toISOString(),
        lookbackSnapshots: history.length,
        alerts: alerts.slice(0, bounded),
    };
}
//# sourceMappingURL=hip6.js.map
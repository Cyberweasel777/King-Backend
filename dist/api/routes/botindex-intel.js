"use strict";
/**
 * BotIndex Intel Routes — DeepSeek-powered intelligence.
 *
 * Domain intel endpoints are free-to-call with teaser responses for anonymous/free users.
 * Paid API keys receive full reports.
 *
 * Alpha Scan is the premium flagship endpoint ($0.10/call via x402 or paid API key bypass).
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const x402Gate_1 = require("../middleware/x402Gate");
const logger_1 = __importDefault(require("../../config/logger"));
const engine_1 = require("../../services/botindex/intel/engine");
const domains_1 = require("../../services/botindex/intel/domains");
// Import raw data fetchers
const trending_1 = require("../../services/botindex/zora/trending");
const attention_1 = require("../../services/botindex/zora/attention");
const creator_scores_1 = require("../../services/botindex/zora/creator-scores");
const funding_arb_1 = require("../../services/botindex/hyperliquid/funding-arb");
const correlation_1 = require("../../services/botindex/hyperliquid/correlation");
const whale_alerts_1 = require("../../services/botindex/hyperliquid/whale-alerts");
const velocityScanner_1 = require("../../services/botindex/meme/velocityScanner");
const trade_signals_1 = require("../../services/botindex/intelligence/trade-signals");
const portfolio_risk_1 = require("../../services/botindex/intelligence/portfolio-risk");
const convergence_detector_1 = require("../../services/botindex/intelligence/convergence-detector");
const launch_alpha_1 = require("../../services/botindex/intelligence/launch-alpha");
const router = (0, express_1.Router)();
const BASE_METADATA = {
    protocol: 'x402',
    version: '1.0',
    provider: 'Renaldo Corp / BotIndex',
};
const TEASER_REASONING_SUFFIX = '... [upgrade for full analysis]';
const ALPHA_SCAN_CACHE_TTL_MS = 5 * 60 * 1000;
const INTEL_UPGRADE = {
    message: 'Upgrade to unlock full multi-asset intel and complete reasoning.',
    pro: {
        register: 'https://api.botindex.dev/api/botindex/keys/register?plan=pro',
        pricing: '$29/mo',
        description: 'Unlimited full intel reports via API key subscription',
    },
    x402: {
        endpoint: '/api/botindex/alpha-scan',
        pricing: '$0.10/call',
        description: 'Premium cross-market Alpha Scan via x402 pay-per-call',
        docs: 'https://www.x402.org',
    },
};
const alphaScanGate = (0, x402Gate_1.createX402Gate)({
    price: '$0.10',
    description: 'BotIndex Alpha Scan convergence intelligence (0.10 USDC)',
});
let alphaScanCache = null;
let alphaScanInFlight = null;
function isPaidApiKey(req) {
    return req.apiKeyAuth?.plan === 'pro' || req.apiKeyAuth?.plan === 'basic';
}
function hasFullIntelAccess(req) {
    if (isPaidApiKey(req))
        return true;
    return Boolean(req.__apiKeyAuthenticated ||
        req.__billingMode === 'subscription' ||
        req.__freeTrialAuthenticated);
}
function hasFullAccess(req) {
    const hasPaidPlan = req.apiKeyAuth?.plan === 'pro' || req.apiKeyAuth?.plan === 'basic';
    const hasBypass = Boolean(req.__apiKeyAuthenticated);
    return hasPaidPlan || hasBypass;
}
function truncateReasoning(reasoning) {
    const normalized = String(reasoning || '').trim();
    const clipped = normalized.slice(0, 50).trimEnd();
    return `${clipped}${TEASER_REASONING_SUFFIX}`;
}
function truncateTeaserReasoning(reasoning, maxLength = 96) {
    const normalized = String(reasoning || '').trim();
    if (normalized.length <= maxLength)
        return normalized;
    return `${normalized.slice(0, maxLength).trimEnd()}...`;
}
function normalizePortfolioDirection(value) {
    if (typeof value !== 'string')
        return null;
    const direction = value.trim().toLowerCase();
    return direction === 'long' || direction === 'short' ? direction : null;
}
function normalizePositionsInput(value) {
    if (!Array.isArray(value) || value.length === 0)
        return null;
    const positions = [];
    for (const row of value) {
        if (typeof row !== 'object' || row === null)
            return null;
        const input = row;
        const asset = typeof input.asset === 'string' ? input.asset.trim().toUpperCase() : '';
        const direction = normalizePortfolioDirection(input.direction);
        const sizePct = Number(input.size_pct);
        if (!asset || !direction || !Number.isFinite(sizePct) || sizePct <= 0) {
            return null;
        }
        positions.push({
            asset,
            direction,
            size_pct: sizePct,
        });
    }
    return positions;
}
function truncateMarketSummary(summary) {
    const normalized = String(summary || '').trim();
    if (normalized.length <= 100) {
        return normalized;
    }
    return `${normalized.slice(0, 100).trimEnd()}...`;
}
function buildTeaserReport(report) {
    const topAsset = report.assets[0];
    return {
        ...report,
        assets: topAsset
            ? [{
                    ...topAsset,
                    reasoning: truncateReasoning(topAsset.reasoning),
                }]
            : [],
        marketSummary: truncateMarketSummary(report.marketSummary),
        topPick: null,
        upgrade: INTEL_UPGRADE,
        isTruncated: true,
    };
}
function sendIntelResponse(req, res, report, metadata) {
    if (hasFullIntelAccess(req)) {
        res.json({
            ...report,
            isTruncated: false,
            metadata: {
                ...metadata,
                tier: 'full',
                access: 'subscription',
            },
        });
        return;
    }
    res.json({
        ...buildTeaserReport(report),
        metadata: {
            ...metadata,
            tier: 'teaser',
            access: 'free',
        },
    });
}
function preventFreeApiKeyBypass(req, _res, next) {
    // createX402Gate currently bypasses for any req.apiKeyAuth object.
    // For premium-only endpoints, free keys must still pay via x402.
    if (req.apiKeyAuth?.plan === 'free') {
        delete req.apiKeyAuth;
    }
    next();
}
async function generateAlphaScanReport() {
    const [whales, funding, zora, correlation, memeVelocity] = await Promise.all([
        (0, whale_alerts_1.getHyperliquidWhaleAlerts)(),
        (0, funding_arb_1.getFundingArbOpportunities)(),
        (0, trending_1.getZoraTrendingCoins)(20),
        (0, correlation_1.getHLCorrelationMatrix)(),
        (0, velocityScanner_1.scanMemeTokenVelocity)(),
    ]);
    // Engine-level cache key is domain-only. Use 5-min buckets to enforce 5-min refresh.
    const cacheBucket = Math.floor(Date.now() / ALPHA_SCAN_CACHE_TTL_MS);
    const report = await (0, engine_1.generateIntelReport)({ ...domains_1.alphaScanConfig, domain: `alpha-scan-${cacheBucket}` }, { whales, funding, zora, correlation, memeVelocity });
    return {
        ...report,
        domain: 'alpha-scan',
    };
}
async function getAlphaScanReportWithCache() {
    const now = Date.now();
    if (alphaScanCache && alphaScanCache.expiresAt > now) {
        return { report: alphaScanCache.report, cached: true };
    }
    if (alphaScanInFlight) {
        const report = await alphaScanInFlight;
        return { report, cached: true };
    }
    alphaScanInFlight = (async () => {
        const report = await generateAlphaScanReport();
        alphaScanCache = {
            report,
            expiresAt: Date.now() + ALPHA_SCAN_CACHE_TTL_MS,
        };
        return report;
    })().finally(() => {
        alphaScanInFlight = null;
    });
    const report = await alphaScanInFlight;
    return { report, cached: false };
}
// ─── Zora Intel ─────────────────────────────────────────────────────────────
router.get('/zora/intel', async (req, res) => {
    try {
        // Fetch all raw Zora data in parallel
        const [trending, momentum, creators] = await Promise.all([
            (0, trending_1.getZoraTrendingCoins)(15),
            (0, attention_1.getAttentionMomentum)(10),
            (0, creator_scores_1.getZoraCreatorScores)(10),
        ]);
        const report = await (0, engine_1.generateIntelReport)(domains_1.zoraIntelConfig, {
            trending,
            momentum,
            creators,
        });
        sendIntelResponse(req, res, report, {
            ...BASE_METADATA,
            endpoint: '/botindex/zora/intel',
            market: 'zora',
        });
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Zora intel generation failed');
        res.status(500).json({
            error: 'intel_generation_failed',
            message: error instanceof Error ? error.message : 'Unknown error',
            metadata: BASE_METADATA,
        });
    }
});
// ─── Hyperliquid Intel ──────────────────────────────────────────────────────
router.get('/hyperliquid/intel', async (req, res) => {
    try {
        const fundingData = await (0, funding_arb_1.getFundingArbOpportunities)();
        const report = await (0, engine_1.generateIntelReport)(domains_1.hyperliquidIntelConfig, fundingData);
        sendIntelResponse(req, res, report, {
            ...BASE_METADATA,
            endpoint: '/botindex/hyperliquid/intel',
            market: 'hyperliquid',
        });
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Hyperliquid intel generation failed');
        res.status(500).json({
            error: 'intel_generation_failed',
            message: error instanceof Error ? error.message : 'Unknown error',
            metadata: BASE_METADATA,
        });
    }
});
// ─── Crypto Intel ───────────────────────────────────────────────────────────
router.get('/crypto/intel', async (req, res) => {
    try {
        // Fetch signals from the existing /signals endpoint handler logic
        const { getBotindexTokenUniverse } = await Promise.resolve().then(() => __importStar(require('../../services/botindex/engine/universe')));
        const { fetchMultiplePriceSeries } = await Promise.resolve().then(() => __importStar(require('../../services/botindex/engine/fetcher')));
        const { generateCorrelationMatrix, getTopCorrelatedPairs } = await Promise.resolve().then(() => __importStar(require('../../services/botindex/engine/matrix')));
        const tokenUniverse = await getBotindexTokenUniverse(30);
        const priceSeriesMap = await fetchMultiplePriceSeries(tokenUniverse, '24h');
        const priceSeries = Array.from(priceSeriesMap.values());
        let signals = [];
        if (priceSeries.length >= 2) {
            const matrix = generateCorrelationMatrix(priceSeries, '24h');
            const top = getTopCorrelatedPairs(matrix, 15, true);
            signals = top.map((p, i) => ({
                id: `corr-${i}`,
                bot: 'correlation_engine',
                signal: p.correlation >= 0.6 ? 'buy' : p.correlation <= -0.6 ? 'sell' : 'hold',
                token: `${p.tokenA}↔${p.tokenB}`,
                confidence: Math.min(0.99, Math.abs(p.correlation)),
            }));
        }
        const report = await (0, engine_1.generateIntelReport)(domains_1.cryptoIntelConfig, {
            signals,
            tokens: tokenUniverse.slice(0, 20),
        });
        sendIntelResponse(req, res, report, {
            ...BASE_METADATA,
            endpoint: '/botindex/crypto/intel',
            market: 'crypto',
        });
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Crypto intel generation failed');
        res.status(500).json({
            error: 'intel_generation_failed',
            message: error instanceof Error ? error.message : 'Unknown error',
            metadata: BASE_METADATA,
        });
    }
});
// ─── Doppler Intel ──────────────────────────────────────────────────────────
router.get('/doppler/intel', async (req, res) => {
    try {
        // Fetch Doppler launches from Zora explore (NEW_CREATORS list)
        const url = 'https://api-sdk.zora.engineering/explore?listType=NEW_CREATORS&count=15';
        const headers = { Accept: 'application/json' };
        const apiKey = process.env.ZORA_API_KEY;
        if (apiKey)
            headers['api-key'] = apiKey;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        let launches = [];
        try {
            const response = await fetch(url, { headers, signal: controller.signal });
            if (response.ok) {
                const payload = await response.json();
                const edges = payload?.exploreList?.edges || [];
                launches = edges.map((e) => {
                    const n = e?.node;
                    return {
                        name: n?.name || '',
                        symbol: n?.symbol || '',
                        creator: n?.creatorProfile?.handle || n?.creatorAddress || 'unknown',
                        liquidity: n?.marketCap || 0,
                        volume: n?.volume24h || 0,
                        holders: n?.uniqueHolders || 0,
                        createdAt: n?.createdAt || '',
                    };
                });
            }
        }
        finally {
            clearTimeout(timeout);
        }
        const report = await (0, engine_1.generateIntelReport)(domains_1.dopplerIntelConfig, { launches });
        sendIntelResponse(req, res, report, {
            ...BASE_METADATA,
            endpoint: '/botindex/doppler/intel',
            market: 'doppler',
        });
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Doppler intel generation failed');
        res.status(500).json({
            error: 'intel_generation_failed',
            message: error instanceof Error ? error.message : 'Unknown error',
            metadata: BASE_METADATA,
        });
    }
});
// ─── BotIndex Intelligence Layer ────────────────────────────────────────────
router.get('/intel/trade-signals', async (req, res) => {
    try {
        const analysis = await (0, trade_signals_1.getTradeSignals)();
        if (hasFullAccess(req)) {
            res.json({
                ...analysis,
                isTruncated: false,
            });
            return;
        }
        const topSignal = analysis.signals[0];
        const preview = topSignal
            ? `${analysis.signals.length} signals detected. Top: ${topSignal.asset} ${topSignal.direction}, confidence ${topSignal.confidence}% — upgrade for full analysis`
            : '0 signals detected. Upgrade for full analysis.';
        res.json({
            signals: topSignal
                ? [{
                        asset: topSignal.asset,
                        direction: topSignal.direction,
                        confidence: topSignal.confidence,
                        reasoning: truncateTeaserReasoning(topSignal.reasoning),
                    }]
                : [],
            analyzedAt: analysis.analyzedAt,
            degraded: analysis.degraded,
            preview,
            isTruncated: true,
            upgrade: {
                message: 'Upgrade to Pro or Basic for full trade signal intelligence.',
                register: 'https://king-backend.fly.dev/api/botindex/keys/register?plan=pro',
            },
        });
    }
    catch (error) {
        logger_1.default.error({ err: error }, '[intel.trade-signals] failed');
        res.status(500).json({
            error: 'intel_trade_signals_failed',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
router.post('/intel/portfolio-risk', async (req, res) => {
    const positions = normalizePositionsInput(req.body?.positions);
    if (!positions) {
        res.status(400).json({
            error: 'invalid_positions',
            message: 'Body must include positions: [{ asset: string, direction: \"long\"|\"short\", size_pct: number > 0 }].',
        });
        return;
    }
    try {
        const analysis = await (0, portfolio_risk_1.scanPortfolioRisk)(positions);
        if (hasFullAccess(req)) {
            res.json({
                ...analysis,
                isTruncated: false,
            });
            return;
        }
        const preview = `Risk score: ${analysis.overall_risk_score}/100 ${analysis.risk_level}. ${analysis.correlated_pairs.length} correlated pairs detected, ${analysis.hedge_recommendations.length} hedge recommended — upgrade for details`;
        res.json({
            overall_risk_score: analysis.overall_risk_score,
            risk_level: analysis.risk_level,
            analyzedAt: analysis.analyzedAt,
            degraded: analysis.degraded,
            preview,
            isTruncated: true,
            upgrade: {
                message: 'Upgrade to Pro or Basic for full portfolio risk analysis.',
                register: 'https://king-backend.fly.dev/api/botindex/keys/register?plan=pro',
            },
        });
    }
    catch (error) {
        logger_1.default.error({ err: error }, '[intel.portfolio-risk] failed');
        res.status(500).json({
            error: 'intel_portfolio_risk_failed',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
router.get('/intel/convergence', async (req, res) => {
    try {
        const analysis = await (0, convergence_detector_1.detectSignalConvergence)();
        if (hasFullAccess(req)) {
            res.json({
                ...analysis,
                isTruncated: false,
            });
            return;
        }
        const top = analysis.convergences[0];
        const preview = top
            ? `${analysis.convergences.length} convergences detected. Strongest: ${top.asset} (${top.signal_count} signals, ${top.direction}) — upgrade for full report`
            : '0 convergences detected. Upgrade for full report.';
        res.json({
            convergence_count: analysis.convergences.length,
            top_asset: top?.asset ?? null,
            analyzedAt: analysis.analyzedAt,
            degraded: analysis.degraded,
            preview,
            isTruncated: true,
            upgrade: {
                message: 'Upgrade to Pro or Basic for full convergence intelligence.',
                register: 'https://king-backend.fly.dev/api/botindex/keys/register?plan=pro',
            },
        });
    }
    catch (error) {
        logger_1.default.error({ err: error }, '[intel.convergence] failed');
        res.status(500).json({
            error: 'intel_convergence_failed',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
router.get('/intel/launch-alpha', async (req, res) => {
    try {
        const analysis = await (0, launch_alpha_1.analyzeLaunchAlpha)();
        if (hasFullAccess(req)) {
            res.json({
                ...analysis,
                isTruncated: false,
            });
            return;
        }
        const top = analysis.launches[0];
        const preview = top
            ? `${analysis.launches.length} launches scored. Top: ${top.token}, confidence ${top.entry_confidence} — upgrade for full rankings`
            : '0 launches scored. Upgrade for full rankings.';
        res.json({
            launches: top
                ? [{ token: top.token, entry_confidence: top.entry_confidence }]
                : [],
            analyzedAt: analysis.analyzedAt,
            degraded: analysis.degraded,
            preview,
            isTruncated: true,
            upgrade: {
                message: 'Upgrade to Pro or Basic for full launch alpha intelligence.',
                register: 'https://king-backend.fly.dev/api/botindex/keys/register?plan=pro',
            },
        });
    }
    catch (error) {
        logger_1.default.error({ err: error }, '[intel.launch-alpha] failed');
        res.status(500).json({
            error: 'intel_launch_alpha_failed',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
// ─── Alpha Scan (Premium) ───────────────────────────────────────────────────
router.get('/alpha-scan', preventFreeApiKeyBypass, alphaScanGate, async (_req, res) => {
    try {
        const { report, cached } = await getAlphaScanReportWithCache();
        res.json({
            ...report,
            isTruncated: false,
            cached,
            metadata: {
                ...BASE_METADATA,
                endpoint: '/botindex/alpha-scan',
                market: 'cross-market',
                tier: 'premium',
                price: '$0.10',
                cacheTtlSeconds: 300,
            },
        });
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Alpha Scan generation failed');
        res.status(500).json({
            error: 'alpha_scan_generation_failed',
            message: error instanceof Error ? error.message : 'Unknown error',
            metadata: {
                ...BASE_METADATA,
                endpoint: '/botindex/alpha-scan',
                tier: 'premium',
                price: '$0.10',
            },
        });
    }
});
exports.default = router;
//# sourceMappingURL=botindex-intel.js.map
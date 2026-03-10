"use strict";
/**
 * BotIndex Intel Routes — DeepSeek-powered premium analysis.
 *
 * Each domain gets a /intel endpoint that:
 * 1. Fetches fresh raw data from existing endpoints
 * 2. Feeds it to DeepSeek for AI analysis
 * 3. Returns structured intelligence (signals, risk scores, grades)
 *
 * All intel endpoints are premium: $0.05/call via x402 or API key.
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
const router = (0, express_1.Router)();
const METADATA = {
    protocol: 'x402',
    version: '1.0',
    provider: 'Renaldo Corp / BotIndex',
    tier: 'premium',
    price: '$0.05',
};
const intelGate = (0, x402Gate_1.createX402Gate)({
    price: '$0.05',
    description: 'BotIndex AI Intelligence Report (0.05 USDC)',
});
// ─── Zora Intel ─────────────────────────────────────────────────────────────
router.get('/zora/intel', intelGate, async (_req, res) => {
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
        res.json({
            ...report,
            metadata: { ...METADATA, endpoint: '/botindex/zora/intel', market: 'zora' },
        });
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Zora intel generation failed');
        res.status(500).json({
            error: 'intel_generation_failed',
            message: error instanceof Error ? error.message : 'Unknown error',
            metadata: METADATA,
        });
    }
});
// ─── Hyperliquid Intel ──────────────────────────────────────────────────────
router.get('/hyperliquid/intel', intelGate, async (_req, res) => {
    try {
        const fundingData = await (0, funding_arb_1.getFundingArbOpportunities)();
        const report = await (0, engine_1.generateIntelReport)(domains_1.hyperliquidIntelConfig, fundingData);
        res.json({
            ...report,
            metadata: { ...METADATA, endpoint: '/botindex/hyperliquid/intel', market: 'hyperliquid' },
        });
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Hyperliquid intel generation failed');
        res.status(500).json({
            error: 'intel_generation_failed',
            message: error instanceof Error ? error.message : 'Unknown error',
            metadata: METADATA,
        });
    }
});
// ─── Crypto Intel ───────────────────────────────────────────────────────────
router.get('/crypto/intel', intelGate, async (req, res) => {
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
        res.json({
            ...report,
            metadata: { ...METADATA, endpoint: '/botindex/crypto/intel', market: 'crypto' },
        });
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Crypto intel generation failed');
        res.status(500).json({
            error: 'intel_generation_failed',
            message: error instanceof Error ? error.message : 'Unknown error',
            metadata: METADATA,
        });
    }
});
// ─── Doppler Intel ──────────────────────────────────────────────────────────
router.get('/doppler/intel', intelGate, async (_req, res) => {
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
        res.json({
            ...report,
            metadata: { ...METADATA, endpoint: '/botindex/doppler/intel', market: 'doppler' },
        });
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Doppler intel generation failed');
        res.status(500).json({
            error: 'intel_generation_failed',
            message: error instanceof Error ? error.message : 'Unknown error',
            metadata: METADATA,
        });
    }
});
exports.default = router;
//# sourceMappingURL=botindex-intel.js.map
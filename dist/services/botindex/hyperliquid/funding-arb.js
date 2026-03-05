"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFundingArbOpportunities = getFundingArbOpportunities;
const logger_1 = __importDefault(require("../../../config/logger"));
const HL_INFO_URL = 'https://api.hyperliquid.xyz/info';
const BINANCE_PREMIUM_URL = 'https://fapi.binance.com/fapi/v1/premiumIndex';
const CACHE_TTL_MS = 5 * 60 * 1000;
const fundingArbCache = new Map();
function toRecord(value) {
    if (typeof value !== 'object' || value === null)
        return null;
    return value;
}
function toNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value))
        return value;
    if (typeof value === 'string') {
        const parsed = Number.parseFloat(value);
        if (Number.isFinite(parsed))
            return parsed;
    }
    return null;
}
function toStringValue(value) {
    if (typeof value === 'string' && value.trim().length > 0)
        return value.trim();
    return null;
}
function round(value, decimals) {
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
async function fetchHyperliquidFundingMap() {
    const payload = await postHyperliquidInfo({ type: 'metaAndAssetCtxs' });
    if (!Array.isArray(payload) || payload.length < 2) {
        throw new Error('Unexpected Hyperliquid metaAndAssetCtxs response');
    }
    const meta = toRecord(payload[0]);
    const contexts = Array.isArray(payload[1]) ? payload[1] : [];
    const universe = meta && Array.isArray(meta.universe) ? meta.universe : [];
    const fundingBySymbol = new Map();
    const length = Math.min(universe.length, contexts.length);
    for (let index = 0; index < length; index += 1) {
        const universeItem = toRecord(universe[index]);
        const ctxItem = toRecord(contexts[index]);
        if (!universeItem || !ctxItem)
            continue;
        const symbol = toStringValue(universeItem.name ?? universeItem.coin ?? universeItem.symbol);
        const funding = toNumber(ctxItem.funding ?? ctxItem.fundingRate ?? ctxItem.predictedFunding);
        if (!symbol || funding === null)
            continue;
        fundingBySymbol.set(symbol.toUpperCase(), funding);
    }
    return fundingBySymbol;
}
async function fetchBinanceFundingMap() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
        const response = await fetch(BINANCE_PREMIUM_URL, {
            headers: { Accept: 'application/json' },
            signal: controller.signal,
        });
        if (!response.ok) {
            throw new Error(`Binance API returned ${response.status}`);
        }
        const payload = (await response.json());
        if (!Array.isArray(payload)) {
            throw new Error('Unexpected Binance premiumIndex response');
        }
        const fundingBySymbol = new Map();
        for (const row of payload) {
            const record = toRecord(row);
            if (!record)
                continue;
            const symbol = toStringValue(record.symbol);
            const funding = toNumber(record.lastFundingRate ?? record.nextFundingRate);
            if (!symbol || funding === null)
                continue;
            fundingBySymbol.set(symbol.toUpperCase(), funding);
        }
        return fundingBySymbol;
    }
    finally {
        clearTimeout(timeout);
    }
}
function determineDirection(spread) {
    if (spread > 0)
        return 'short_hl_long_binance';
    if (spread < 0)
        return 'long_hl_short_binance';
    return 'neutral';
}
async function getFundingArbOpportunities() {
    const cacheKey = 'funding-arb';
    const now = Date.now();
    const cached = fundingArbCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
        return cached.data;
    }
    try {
        const [hyperliquidFunding, binanceFunding] = await Promise.all([
            fetchHyperliquidFundingMap(),
            fetchBinanceFundingMap(),
        ]);
        const opportunities = [];
        for (const [symbol, hlFundingRate] of hyperliquidFunding.entries()) {
            const binanceFundingRate = binanceFunding.get(`${symbol}USDT`) ??
                binanceFunding.get(`${symbol}USDC`) ??
                binanceFunding.get(symbol);
            if (binanceFundingRate === undefined)
                continue;
            const spread = hlFundingRate - binanceFundingRate;
            const annualizedYield = spread * 3 * 365 * 100;
            opportunities.push({
                symbol,
                hlFundingRate: round(hlFundingRate, 8),
                binanceFundingRate: round(binanceFundingRate, 8),
                spread: round(spread, 8),
                annualizedYield: round(annualizedYield, 2),
                direction: determineDirection(spread),
            });
        }
        opportunities.sort((a, b) => Math.abs(b.spread) - Math.abs(a.spread));
        const data = { opportunities };
        fundingArbCache.set(cacheKey, { data, expiresAt: now + CACHE_TTL_MS });
        return data;
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Failed to build Hyperliquid funding arbitrage opportunities');
        throw error;
    }
}
//# sourceMappingURL=funding-arb.js.map
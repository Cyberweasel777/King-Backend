"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHLCorrelationMatrix = getHLCorrelationMatrix;
const logger_1 = __importDefault(require("../../../config/logger"));
const HL_INFO_URL = 'https://api.hyperliquid.xyz/info';
const CACHE_TTL_MS = 5 * 60 * 1000;
const correlationCache = new Map();
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
    const timeout = setTimeout(() => controller.abort(), 10000);
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
async function fetchTopSymbols(limit) {
    const payload = await postHyperliquidInfo({ type: 'metaAndAssetCtxs' });
    if (!Array.isArray(payload) || payload.length < 2) {
        throw new Error('Unexpected Hyperliquid metaAndAssetCtxs response');
    }
    const meta = toRecord(payload[0]);
    const contexts = Array.isArray(payload[1]) ? payload[1] : [];
    const universe = meta && Array.isArray(meta.universe) ? meta.universe : [];
    const ranked = [];
    const length = Math.min(universe.length, contexts.length);
    for (let index = 0; index < length; index += 1) {
        const universeItem = toRecord(universe[index]);
        const ctxItem = toRecord(contexts[index]);
        if (!universeItem || !ctxItem)
            continue;
        const symbol = toStringValue(universeItem.name ?? universeItem.coin ?? universeItem.symbol);
        const openInterest = toNumber(ctxItem.openInterest) ?? 0;
        if (!symbol)
            continue;
        ranked.push({
            symbol: symbol.toUpperCase(),
            openInterest,
            index,
        });
    }
    ranked.sort((a, b) => {
        if (b.openInterest !== a.openInterest)
            return b.openInterest - a.openInterest;
        return a.index - b.index;
    });
    return ranked.slice(0, limit).map((asset) => asset.symbol);
}
function parseCandles(payload) {
    const directCandles = Array.isArray(payload)
        ? payload
        : Array.isArray(toRecord(payload)?.candles)
            ? toRecord(payload)?.candles
            : [];
    const out = [];
    for (const candle of directCandles) {
        const record = toRecord(candle);
        if (!record)
            continue;
        const timestamp = toNumber(record.t ?? record.T ?? record.timestamp ?? record.time);
        const close = toNumber(record.c ?? record.close);
        if (timestamp === null || close === null)
            continue;
        out.push({ timestamp, close });
    }
    out.sort((a, b) => a.timestamp - b.timestamp);
    const dedupedByTimestamp = new Map();
    for (const row of out) {
        dedupedByTimestamp.set(row.timestamp, row);
    }
    return Array.from(dedupedByTimestamp.values()).sort((a, b) => a.timestamp - b.timestamp);
}
async function fetchHourlyCloseSeries(symbol, hours) {
    const endTime = Date.now();
    const startTime = endTime - hours * 60 * 60 * 1000;
    const payload = await postHyperliquidInfo({
        type: 'candleSnapshot',
        req: {
            coin: symbol,
            interval: '1h',
            startTime,
            endTime,
        },
    });
    return parseCandles(payload);
}
function buildReturnsMap(series) {
    const returns = new Map();
    for (let index = 1; index < series.length; index += 1) {
        const previous = series[index - 1].close;
        const current = series[index].close;
        if (!Number.isFinite(previous) || !Number.isFinite(current) || previous <= 0)
            continue;
        const ret = (current - previous) / previous;
        returns.set(series[index].timestamp, ret);
    }
    return returns;
}
function alignReturns(left, right) {
    const timestamps = [];
    for (const timestamp of left.keys()) {
        if (right.has(timestamp))
            timestamps.push(timestamp);
    }
    timestamps.sort((a, b) => a - b);
    const leftSeries = [];
    const rightSeries = [];
    for (const timestamp of timestamps) {
        const leftValue = left.get(timestamp);
        const rightValue = right.get(timestamp);
        if (leftValue === undefined || rightValue === undefined)
            continue;
        leftSeries.push(leftValue);
        rightSeries.push(rightValue);
    }
    return { leftSeries, rightSeries };
}
function pearson(left, right) {
    if (left.length !== right.length || left.length < 2)
        return 0;
    const n = left.length;
    const sumLeft = left.reduce((sum, value) => sum + value, 0);
    const sumRight = right.reduce((sum, value) => sum + value, 0);
    const sumLeftSq = left.reduce((sum, value) => sum + value * value, 0);
    const sumRightSq = right.reduce((sum, value) => sum + value * value, 0);
    const sumCross = left.reduce((sum, value, index) => sum + value * right[index], 0);
    const numerator = n * sumCross - sumLeft * sumRight;
    const denominator = Math.sqrt((n * sumLeftSq - sumLeft ** 2) * (n * sumRightSq - sumRight ** 2));
    if (denominator === 0)
        return 0;
    return Math.max(-1, Math.min(1, numerator / denominator));
}
async function getHLCorrelationMatrix() {
    const cacheKey = 'hl-correlation-matrix';
    const now = Date.now();
    const cached = correlationCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
        return cached.data;
    }
    try {
        const symbols = await fetchTopSymbols(8);
        if (symbols.length === 0) {
            const empty = {
                matrix: {},
                timestamp: new Date().toISOString(),
            };
            correlationCache.set(cacheKey, { data: empty, expiresAt: now + CACHE_TTL_MS });
            return empty;
        }
        const seriesEntries = await Promise.all(symbols.map(async (symbol) => {
            try {
                const series = await fetchHourlyCloseSeries(symbol, 48);
                return { symbol, series };
            }
            catch (error) {
                logger_1.default.warn({ err: error, symbol }, 'Failed to fetch Hyperliquid candles for symbol');
                return { symbol, series: [] };
            }
        }));
        const returnsBySymbol = new Map();
        for (const entry of seriesEntries) {
            if (entry.series.length < 12)
                continue;
            const returns = buildReturnsMap(entry.series);
            if (returns.size < 8)
                continue;
            returnsBySymbol.set(entry.symbol, returns);
        }
        const usableSymbols = Array.from(returnsBySymbol.keys());
        const matrix = {};
        for (const symbol of usableSymbols) {
            matrix[symbol] = {};
        }
        for (let i = 0; i < usableSymbols.length; i += 1) {
            const leftSymbol = usableSymbols[i];
            matrix[leftSymbol][leftSymbol] = 1;
            for (let j = i + 1; j < usableSymbols.length; j += 1) {
                const rightSymbol = usableSymbols[j];
                const leftReturns = returnsBySymbol.get(leftSymbol);
                const rightReturns = returnsBySymbol.get(rightSymbol);
                if (!leftReturns || !rightReturns)
                    continue;
                const aligned = alignReturns(leftReturns, rightReturns);
                const correlation = aligned.leftSeries.length >= 8
                    ? round(pearson(aligned.leftSeries, aligned.rightSeries), 4)
                    : 0;
                matrix[leftSymbol][rightSymbol] = correlation;
                matrix[rightSymbol][leftSymbol] = correlation;
            }
        }
        const data = {
            matrix,
            timestamp: new Date().toISOString(),
        };
        correlationCache.set(cacheKey, { data, expiresAt: now + CACHE_TTL_MS });
        return data;
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Failed to build Hyperliquid correlation matrix');
        throw error;
    }
}
//# sourceMappingURL=correlation.js.map
"use strict";
/**
 * MemeRadar service facade for King Backend
 * Provides token discovery + trending + whale transactions.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTokens = getTokens;
exports.getTrending = getTrending;
exports.getWhales = getWhales;
exports.getWhalesWithDebug = getWhalesWithDebug;
exports.resolveToken = resolveToken;
exports.getTokenReport = getTokenReport;
exports.evaluateTokenAlerts = evaluateTokenAlerts;
const dexscreener_1 = require("./scrapers/dexscreener");
const helius_1 = require("./scrapers/helius");
const provenance_1 = require("./provenance");
const alerts_1 = require("./alerts");
const dex = new dexscreener_1.DexScreenerScraper();
function getHelius() {
    const key = process.env.HELIUS_API_KEY;
    if (!key)
        return null;
    return new helius_1.HeliusScraper(key);
}
async function getTokens(params) {
    const limit = Math.min(params?.limit ?? 20, 50);
    const q = params?.q?.trim();
    const chain = params?.chain?.trim().toLowerCase();
    if (q) {
        const found = await dex.searchTokens(q);
        const filtered = chain ? found.filter((t) => t.chain === chain) : found;
        return filtered.slice(0, limit);
    }
    // Default: trending Solana memecoins
    const trending = await dex.getTrendingSolana(limit);
    const tokens = trending.map((t) => t.token);
    return chain ? tokens.filter((t) => t.chain === chain).slice(0, limit) : tokens;
}
async function getTrending(params) {
    const limit = Math.min(params?.limit ?? 20, 50);
    const chain = params?.chain ?? 'solana';
    if (chain === 'solana')
        return dex.getTrendingSolana(limit);
    // For now, reuse search as a proxy for base trending
    const tokens = await dex.searchTokens('base');
    return tokens.slice(0, limit).map((token, i) => ({
        rank: i + 1,
        token,
        trendingScore: token.volume24h + token.liquidityUsd,
    }));
}
async function getWhales(params) {
    const helius = getHelius();
    if (!helius)
        return [];
    const limit = Math.min(params.limit ?? 50, 100);
    return helius.getWalletTransactions(params.wallet, limit);
}
async function getWhalesWithDebug(params) {
    const helius = getHelius();
    const limit = Math.min(params.limit ?? 50, 100);
    if (!helius) {
        return {
            whales: [],
            debug: {
                signaturesFetched: 0,
                txDetailsAttempted: 0,
                txDetailsSucceeded: 0,
                parsedTransfers: 0,
                firstError: 'helius_not_configured',
                heliusStatusCodes: { getTransaction: [] },
            },
        };
    }
    const { transactions, debug } = await helius.getWalletTransactionsWithDebug(params.wallet, limit);
    return { whales: transactions, debug };
}
async function resolveToken(identifier, chain = 'solana') {
    const q = identifier.trim();
    if (!q)
        return null;
    // Address-ish input goes straight to token endpoint first.
    const maybeAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(q) || /^0x[a-fA-F0-9]{40}$/.test(q);
    if (maybeAddress) {
        const byAddress = await dex.getTokenByAddress(q, chain);
        if (byAddress)
            return byAddress;
    }
    const found = await dex.searchTokens(q);
    return found.find((t) => t.chain === chain) || found[0] || null;
}
async function getTokenReport(identifier, chain = 'solana') {
    const token = await resolveToken(identifier, chain);
    if (!token)
        return null;
    if (token.chain === 'solana') {
        const helius = getHelius();
        if (helius) {
            token.holders = await helius.getTokenHolders(token.address);
        }
    }
    return {
        token,
        provenance: (0, provenance_1.buildProvenanceReport)(token),
    };
}
function evaluateTokenAlerts(telemetry) {
    return (0, alerts_1.evaluateAlerts)(telemetry);
}
//# sourceMappingURL=index.js.map
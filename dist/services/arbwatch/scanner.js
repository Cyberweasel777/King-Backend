"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rankScannerOpportunities = rankScannerOpportunities;
exports.runArbScanner = runArbScanner;
const predictionArb_1 = require("../signals/predictionArb");
const scrapers_1 = require("./scrapers");
function normalizeEventKey(text) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120);
}
function clamp01(n) {
    return Math.max(0, Math.min(1, n));
}
function round4(n) {
    return Math.round(n * 10000) / 10000;
}
function feeBpsForVenue(venue) {
    const key = `ARB_SCANNER_${venue.toUpperCase()}_FEE_BPS`;
    const raw = process.env[key];
    const parsed = raw ? Number(raw) : 0;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}
function extractPricePoints(markets, venue) {
    const points = [];
    for (const m of markets) {
        const outcomes = Object.keys(m.outcomePrices);
        if (outcomes.length !== 2)
            continue;
        const a = outcomes[0];
        const b = outcomes[1];
        const aPrice = clamp01(m.outcomePrices[a]);
        const bPrice = clamp01(m.outcomePrices[b]);
        points.push({
            eventKey: normalizeEventKey(m.question),
            eventTitle: m.question,
            outcome: a,
            venue,
            yesPrice: aPrice,
            noPrice: bPrice,
            liquidity: m.liquidity || m.volume24h || 0,
        });
        points.push({
            eventKey: normalizeEventKey(m.question),
            eventTitle: m.question,
            outcome: b,
            venue,
            yesPrice: bPrice,
            noPrice: aPrice,
            liquidity: m.liquidity || m.volume24h || 0,
        });
    }
    return points;
}
function rankScannerOpportunities(points, query) {
    const byEventOutcome = new Map();
    for (const p of points) {
        const key = `${p.eventKey}::${p.outcome.toLowerCase()}`;
        const list = byEventOutcome.get(key) ?? [];
        list.push(p);
        byEventOutcome.set(key, list);
    }
    const ranked = [];
    for (const [key, list] of byEventOutcome.entries()) {
        if (list.length < 2)
            continue;
        const buy = [...list].sort((a, b) => a.yesPrice - b.yesPrice)[0];
        const sell = [...list]
            .filter((p) => p.venue !== buy.venue)
            .sort((a, b) => (b.yesPrice - b.noPrice) - (a.yesPrice - a.noPrice))[0];
        if (!buy || !sell)
            continue;
        const buyFeeBps = feeBpsForVenue(buy.venue);
        const sellFeeBps = feeBpsForVenue(sell.venue);
        const grossSell = clamp01(1 - sell.noPrice);
        const grossEdgePct = ((grossSell - buy.yesPrice) / Math.max(buy.yesPrice, 0.0001)) * 100;
        const effectiveBuy = buy.yesPrice * (1 + buyFeeBps / 10_000);
        const effectiveSell = grossSell * (1 - sellFeeBps / 10_000);
        const netEdgePct = ((effectiveSell - effectiveBuy) / Math.max(effectiveBuy, 0.0001)) * 100;
        if (netEdgePct < query.minEdgePct)
            continue;
        const opportunity = {
            id: `scanner_${Buffer.from(key).toString('base64').slice(0, 12)}_${buy.venue}_${sell.venue}`,
            eventKey: buy.eventKey,
            eventTitle: buy.eventTitle,
            outcome: buy.outcome,
            buy: {
                venue: buy.venue,
                price: round4(buy.yesPrice),
                feeBps: buyFeeBps,
                effectivePrice: round4(effectiveBuy),
            },
            sell: {
                venue: sell.venue,
                price: round4(grossSell),
                feeBps: sellFeeBps,
                effectivePrice: round4(effectiveSell),
            },
            grossEdgePct: round4(grossEdgePct),
            netEdgePct: round4(netEdgePct),
            liquidityScore: round4(Math.min(100, (buy.liquidity + sell.liquidity) / 2000)),
            detectedAt: new Date().toISOString(),
            source: 'live_scan',
        };
        ranked.push(opportunity);
    }
    return ranked
        .sort((a, b) => (b.netEdgePct - a.netEdgePct) || (b.liquidityScore - a.liquidityScore))
        .slice(0, query.limit);
}
async function runArbScanner(query) {
    const { results, meta } = await (0, scrapers_1.scrapeAllWithMeta)();
    const sourceStatus = Object.entries(meta).map(([source, m]) => ({
        source,
        ok: m.ok,
        markets: m.count.markets,
        errors: m.errors,
    }));
    const points = [];
    for (const [venue, result] of Object.entries(results)) {
        points.push(...extractPricePoints(result.markets, venue));
    }
    const live = rankScannerOpportunities(points, query);
    const { feed } = (0, predictionArb_1.getPredictionArbFeed)();
    const feedOps = feed
        ? feed.opportunities.slice(0, query.maxPerEvent).map((op, idx) => ({
            id: `feed_${idx}_${op.eventSlug}`,
            eventKey: normalizeEventKey(op.marketTitle),
            eventTitle: op.marketTitle,
            outcome: op.outcome,
            buy: {
                venue: op.bestBuyVenue,
                price: round4(op.buyPrice),
                feeBps: feeBpsForVenue(op.bestBuyVenue),
                effectivePrice: round4(op.buyPrice * (1 + feeBpsForVenue(op.bestBuyVenue) / 10_000)),
            },
            sell: {
                venue: op.bestSellVenue,
                price: round4(op.sellPrice),
                feeBps: feeBpsForVenue(op.bestSellVenue),
                effectivePrice: round4(op.sellPrice * (1 - feeBpsForVenue(op.bestSellVenue) / 10_000)),
            },
            grossEdgePct: round4(op.grossEdgePct),
            netEdgePct: round4(op.estimatedNetEdgePct),
            liquidityScore: 0,
            detectedAt: op.timestamp,
            source: 'feed',
        }))
        : [];
    const opportunities = [...live, ...feedOps]
        .filter((op) => op.netEdgePct >= query.minEdgePct)
        .sort((a, b) => b.netEdgePct - a.netEdgePct)
        .slice(0, query.limit);
    if (feed) {
        sourceStatus.push({
            source: 'prediction_arb_feed',
            ok: true,
            markets: feed.opportunities.length,
            errors: [],
        });
    }
    return {
        generatedAt: new Date().toISOString(),
        query,
        sourceStatus,
        opportunities,
    };
}
//# sourceMappingURL=scanner.js.map
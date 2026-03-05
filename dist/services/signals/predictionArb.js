"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPredictionArbFeed = getPredictionArbFeed;
exports.buildHeatMap = buildHeatMap;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
function getPredictionArbFeed() {
    const sourcePath = resolveFeedPath();
    if (!sourcePath)
        return { feed: null, sourcePath: null };
    try {
        const raw = fs_1.default.readFileSync(sourcePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed?.opportunities)) {
            return { feed: null, sourcePath };
        }
        return { feed: parsed, sourcePath };
    }
    catch {
        return { feed: null, sourcePath };
    }
}
function buildHeatMap(feed) {
    const venueStats = feed.venueStats ?? [];
    const edgeByVenue = new Map();
    for (const op of feed.opportunities) {
        edgeByVenue.set(op.bestBuyVenue, Math.max(edgeByVenue.get(op.bestBuyVenue) ?? 0, op.estimatedNetEdgePct));
        edgeByVenue.set(op.bestSellVenue, Math.max(edgeByVenue.get(op.bestSellVenue) ?? 0, op.estimatedNetEdgePct));
    }
    return venueStats
        .map((venue) => {
        const edge = edgeByVenue.get(venue.venue) ?? 0;
        const liquidityScore = Math.min(100, venue.totalLiquidityUsd / 50000);
        const volumeScore = Math.min(100, venue.totalVolume24h / 10000);
        const edgeScore = Math.min(100, edge * 3);
        const recencyScore = venue.avgResolutionHours === null ? 30 : Math.max(0, 100 - Math.min(100, venue.avgResolutionHours / 24));
        const heatScore = round2(liquidityScore * 0.35 + volumeScore * 0.3 + edgeScore * 0.25 + recencyScore * 0.1);
        return {
            venue: venue.venue,
            liquidityUsd: venue.totalLiquidityUsd,
            volume24h: venue.totalVolume24h,
            avgPricePct: round2(venue.avgPrice * 100),
            avgResolutionHours: venue.avgResolutionHours,
            topEdgeNetPct: round2(edge),
            heatScore,
        };
    })
        .sort((a, b) => b.heatScore - a.heatScore);
}
function resolveFeedPath() {
    const envPath = process.env.PREDICTION_ARB_FEED_PATH;
    if (envPath)
        return envPath;
    const candidates = [
        path_1.default.resolve(process.cwd(), '..', 'dashboard', 'intel-feed-prediction-arb.json'),
        path_1.default.resolve(process.cwd(), 'dashboard', 'intel-feed-prediction-arb.json'),
        path_1.default.resolve(process.cwd(), '..', 'Projects', 'spreadhunter', 'reports', 'prediction-arb-latest.json'),
    ];
    for (const candidate of candidates) {
        if (fs_1.default.existsSync(candidate))
            return candidate;
    }
    return null;
}
function round2(n) {
    return Math.round(n * 100) / 100;
}
//# sourceMappingURL=predictionArb.js.map
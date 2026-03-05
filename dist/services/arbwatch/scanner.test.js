"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const scanner_1 = require("./scanner");
function run() {
    process.env.ARB_SCANNER_POLYMARKET_FEE_BPS = '10';
    process.env.ARB_SCANNER_KALSHI_FEE_BPS = '20';
    const points = [
        {
            eventKey: 'fed cuts rates 2026',
            eventTitle: 'Will Fed cut rates by June 2026?',
            outcome: 'Yes',
            venue: 'polymarket',
            yesPrice: 0.41,
            noPrice: 0.59,
            liquidity: 20000,
        },
        {
            eventKey: 'fed cuts rates 2026',
            eventTitle: 'Will Fed cut rates by June 2026?',
            outcome: 'Yes',
            venue: 'kalshi',
            yesPrice: 0.51,
            noPrice: 0.49,
            liquidity: 15000,
        },
    ];
    const opportunities = (0, scanner_1.rankScannerOpportunities)(points, {
        limit: 10,
        minEdgePct: 0.1,
        maxPerEvent: 10,
    });
    strict_1.default.equal(opportunities.length, 1);
    strict_1.default.equal(opportunities[0].buy.venue, 'polymarket');
    strict_1.default.equal(opportunities[0].sell.venue, 'kalshi');
    strict_1.default.ok(opportunities[0].grossEdgePct > 20);
    strict_1.default.ok(opportunities[0].netEdgePct > 20);
    const filtered = (0, scanner_1.rankScannerOpportunities)(points, {
        limit: 10,
        minEdgePct: 99,
        maxPerEvent: 10,
    });
    strict_1.default.equal(filtered.length, 0);
    console.log('scanner.test.ts passed');
}
run();
//# sourceMappingURL=scanner.test.js.map
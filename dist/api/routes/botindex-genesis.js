"use strict";
/**
 * BotIndex Genesis Routes — Metaplex Genesis launch data from Solana
 * Reads on-chain launch data from the Metaplex Genesis program
 */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const x402Gate_1 = require("../middleware/x402Gate");
const genesis_fetcher_1 = require("../../services/genesis-fetcher");
const router = (0, express_1.Router)();
// GET /v1/solana/launches — All Genesis launches on Solana
router.get('/solana/launches', (0, x402Gate_1.createX402Gate)({ price: '$0.02', description: 'Metaplex Genesis token launches on Solana' }), async (_req, res) => {
    try {
        const data = await (0, genesis_fetcher_1.getAllLaunches)();
        res.json({
            launches: data.launches,
            source: 'metaplex_genesis_onchain',
            chain: 'solana',
            count: data.launches.length,
            updatedAt: data.updatedAt,
            ...(data.stale ? { stale: true } : {}),
            ...(data.error ? { error: data.error } : {}),
            metadata: { protocol: 'x402', endpoint: '/v1/solana/launches' },
        });
    }
    catch (error) {
        res.json({
            launches: [],
            source: 'metaplex_genesis_onchain',
            chain: 'solana',
            count: 0,
            stale: true,
            error: error instanceof Error ? error.message : 'Metaplex Genesis fetch failed',
            updatedAt: new Date().toISOString(),
            metadata: { protocol: 'x402', endpoint: '/v1/solana/launches' },
        });
    }
});
// GET /v1/solana/active — Active Genesis launches only
router.get('/solana/active', (0, x402Gate_1.createX402Gate)({ price: '$0.02', description: 'Active Metaplex Genesis launches on Solana' }), async (_req, res) => {
    try {
        const data = await (0, genesis_fetcher_1.getActiveLaunches)();
        res.json({
            launches: data.launches,
            source: 'metaplex_genesis_onchain',
            chain: 'solana',
            count: data.launches.length,
            updatedAt: data.updatedAt,
            ...(data.stale ? { stale: true } : {}),
            ...(data.error ? { error: data.error } : {}),
            metadata: { protocol: 'x402', endpoint: '/v1/solana/active' },
        });
    }
    catch (error) {
        res.json({
            launches: [],
            source: 'metaplex_genesis_onchain',
            chain: 'solana',
            count: 0,
            stale: true,
            error: error instanceof Error ? error.message : 'Metaplex Genesis fetch failed',
            updatedAt: new Date().toISOString(),
            metadata: { protocol: 'x402', endpoint: '/v1/solana/active' },
        });
    }
});
exports.default = router;
//# sourceMappingURL=botindex-genesis.js.map
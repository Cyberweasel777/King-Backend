"use strict";
/**
 * BotIndex Aliases — Top-level discoverable routes
 * Maps branded names to canonical endpoints for better discoverability
 */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const x402Gate_1 = require("../middleware/x402Gate");
const genesis_fetcher_1 = require("../../services/genesis-fetcher");
const router = (0, express_1.Router)();
const GRADSNIPER_URL = process.env.GRADSNIPER_URL || 'https://gradsniper.fly.dev';
// ─── Catapult (Hyperliquid token graduations) ───
router.get('/catapult/graduating', (0, x402Gate_1.createX402Gate)({ price: '$0.02', description: 'Catapult→Hyperliquid graduation signals' }), async (_req, res) => {
    try {
        const response = await fetch(`${GRADSNIPER_URL}/api/graduating`);
        if (!response.ok)
            throw new Error(`GradSniper returned ${response.status}`);
        const data = await response.json();
        res.json({
            ...data,
            source: 'gradsniper_catapult',
            alias: '/catapult/graduating → /v1/crypto/graduating',
            metadata: { protocol: 'x402', endpoint: '/catapult/graduating' },
        });
    }
    catch (error) {
        res.json({
            tokens: [],
            source: 'gradsniper_catapult',
            error: error instanceof Error ? error.message : 'Catapult fetch failed',
            metadata: { protocol: 'x402', endpoint: '/catapult/graduating' },
        });
    }
});
// ─── Metaplex (Solana Genesis launches) ───
router.get('/metaplex/launches', (0, x402Gate_1.createX402Gate)({ price: '$0.02', description: 'Metaplex Genesis token launches on Solana' }), async (_req, res) => {
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
            alias: '/metaplex/launches → /v1/solana/launches',
            metadata: { protocol: 'x402', endpoint: '/metaplex/launches' },
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
            metadata: { protocol: 'x402', endpoint: '/metaplex/launches' },
        });
    }
});
router.get('/metaplex/active', (0, x402Gate_1.createX402Gate)({ price: '$0.02', description: 'Active Metaplex Genesis launches on Solana' }), async (_req, res) => {
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
            alias: '/metaplex/active → /v1/solana/active',
            metadata: { protocol: 'x402', endpoint: '/metaplex/active' },
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
            metadata: { protocol: 'x402', endpoint: '/metaplex/active' },
        });
    }
});
exports.default = router;
//# sourceMappingURL=botindex-aliases.js.map
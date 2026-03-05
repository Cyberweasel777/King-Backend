"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const hitCounter_1 = require("../middleware/hitCounter");
const convex_client_1 = require("../../shared/analytics/convex-client");
const router = (0, express_1.Router)();
function getAdminId(value) {
    return typeof value === 'string' ? value : null;
}
function parsePositiveNumber(value) {
    if (typeof value !== 'string')
        return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0)
        return undefined;
    return parsed;
}
router.get('/botindex/admin/hits', (req, res) => {
    const adminId = getAdminId(req.query.adminId);
    if (adminId !== '8063432083') {
        res.status(403).json({ error: 'unauthorized' });
        return;
    }
    res.json((0, hitCounter_1.getHits)());
});
router.get('/botindex/admin/analytics', async (req, res) => {
    const adminId = getAdminId(req.query.adminId);
    if (adminId !== '8063432083') {
        res.status(403).json({ error: 'unauthorized' });
        return;
    }
    const store = (0, convex_client_1.getOptionalConvexAnalyticsStore)();
    if (!store) {
        res.status(503).json({
            error: 'convex_unavailable',
            message: 'Convex analytics is not configured.',
        });
        return;
    }
    const sinceHours = parsePositiveNumber(req.query.sinceHours);
    const bucketMs = parsePositiveNumber(req.query.bucketMs);
    const walletLimit = parsePositiveNumber(req.query.walletLimit);
    const sinceTimestamp = typeof sinceHours === 'number' ? Date.now() - Math.floor(sinceHours * 60 * 60 * 1000) : undefined;
    try {
        const [analytics, walletCRM] = await Promise.all([
            store.getAnalytics({ sinceTimestamp, bucketMs }),
            store.getWalletCRM({ limit: walletLimit }),
        ]);
        res.json({
            generatedAt: new Date().toISOString(),
            analytics,
            walletCRM,
        });
    }
    catch (error) {
        res.status(502).json({
            error: 'analytics_query_failed',
            message: error instanceof Error ? error.message : 'Failed to query Convex analytics',
        });
    }
});
exports.default = router;
//# sourceMappingURL=admin-hits.js.map
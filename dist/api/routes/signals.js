"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const predictionArb_1 = require("../../services/signals/predictionArb");
const payments_1 = require("../../shared/payments");
const router = (0, express_1.Router)();
router.get('/prediction-arb', (_req, res) => {
    const { feed, sourcePath } = (0, predictionArb_1.getPredictionArbFeed)();
    if (!feed) {
        res.status(404).json({
            error: 'prediction arb feed unavailable',
            sourcePath,
            hint: 'Run SpreadHunter prediction scan or set PREDICTION_ARB_FEED_PATH',
        });
        return;
    }
    res.json({
        sourcePath,
        feed,
    });
});
router.get('/prediction-arb/heatmap', (0, payments_1.withSubscriptionHttp)('arbwatch', 'pro'), (_req, res) => {
    const { feed, sourcePath } = (0, predictionArb_1.getPredictionArbFeed)();
    if (!feed) {
        res.status(404).json({
            error: 'prediction arb feed unavailable',
            sourcePath,
            hint: 'Run SpreadHunter prediction scan or set PREDICTION_ARB_FEED_PATH',
        });
        return;
    }
    res.json({
        sourcePath,
        generatedAt: feed.timestamp,
        mode: feed.mode,
        heatmap: (0, predictionArb_1.buildHeatMap)(feed),
    });
});
exports.default = router;
//# sourceMappingURL=signals.js.map
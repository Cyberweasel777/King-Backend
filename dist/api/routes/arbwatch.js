"use strict";
/**
 * ArbWatch API Routes
 * Arbitrage opportunity detection and position tracking
 *
 * TODO: Paste your working ArbWatch code into the handlers below
 */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const arbwatch_1 = require("../../services/arbwatch");
const predictionArb_1 = require("../../services/signals/predictionArb");
const router = (0, express_1.Router)();
// ============================================================================
// HEALTH CHECK
// ============================================================================
router.get('/health', (req, res) => {
    res.json({
        app: 'arbwatch',
        status: 'ok',
        timestamp: new Date().toISOString()
    });
});
// ============================================================================
// LIST MARKETS
// GET /api/arbwatch/markets — List tracked prediction markets
// ============================================================================
router.get('/markets', async (req, res) => {
    res.json({
        markets: (0, arbwatch_1.getMarkets)(),
        message: 'OK'
    });
});
// ============================================================================
// OPPORTUNITIES
// GET /api/arbwatch/opportunities — Get arbitrage opportunities
// Free: limit=3 (default)
// Basic+: larger limits and Deepseek-enhanced scoring
// ============================================================================
router.get('/opportunities', async (req, res) => {
    const limit = Math.min(parseInt(String(req.query.limit || '3'), 10) || 3, 50);
    const minProfitPercent = parseFloat(String(req.query.minProfitPercent || '0.5')) || 0.5;
    const useDeepseek = String(req.query.deepseek || 'true') !== 'false';
    const debug = String(req.query.debug || 'false') === 'true';
    const includePredictionExpansion = String(req.query.includePredictionExpansion || 'true') !== 'false';
    try {
        const { opportunities, meta } = await (0, arbwatch_1.getOpportunities)({
            limit,
            minProfitPercent,
            useDeepseek,
            debug,
        });
        const { feed, sourcePath } = includePredictionExpansion ? (0, predictionArb_1.getPredictionArbFeed)() : { feed: null, sourcePath: null };
        const predictionExpansion = feed
            ? feed.opportunities.slice(0, limit).map((op) => ({
                eventSlug: op.eventSlug,
                marketTitle: op.marketTitle,
                outcome: op.outcome,
                buyVenue: op.bestBuyVenue,
                sellVenue: op.bestSellVenue,
                grossEdgePct: op.grossEdgePct,
                netEdgePct: op.estimatedNetEdgePct,
                detectedAt: op.timestamp,
            }))
            : [];
        res.json({
            opportunities,
            meta,
            predictionExpansion: {
                enabled: includePredictionExpansion,
                sourcePath,
                count: predictionExpansion.length,
                items: predictionExpansion,
            },
        });
    }
    catch (error) {
        // Best-effort: never throw from this endpoint.
        res.json({
            opportunities: [],
            meta: {
                markets: (0, arbwatch_1.getMarkets)(),
                matches: 0,
                matchedOutcomes: 0,
                scrapedAt: new Date().toISOString(),
                useDeepseek,
                minProfitPercent,
                limit,
                ...(debug ? { errors: [error?.message || String(error)] } : {}),
            },
        });
    }
});
// ============================================================================
// CREATE POSITION
// POST /api/arbwatch/positions — Log an arbitrage position
// TODO: Add withSubscription('arbwatch', 'pro') — execution is premium
// ============================================================================
router.post('/positions', async (req, res) => {
    // TODO: Paste your working position creation code here
    // Your code should:
    // 1. Validate position data (opportunity ID, amount, entry prices)
    // 2. Log position to database
    // 3. Optionally trigger execution (premium)
    // 4. Return position with ID
    //
    // AFTER PASTE: Gate execution with: withSubscription('arbwatch', 'pro')
    // STUB:
    const { opportunityId, amount, autoExecute } = req.body;
    res.status(201).json({
        id: 'position-id',
        opportunityId,
        amount,
        status: autoExecute ? 'pending_execution' : 'logged',
        createdAt: new Date().toISOString(),
        message: 'TODO: Paste your working position code here (Execution is Premium)'
    });
});
// ============================================================================
// LIST POSITIONS
// GET /api/arbwatch/positions — Get user's positions
// ============================================================================
router.get('/positions', async (req, res) => {
    // TODO: Paste your working position listing code here
    // Your code should:
    // 1. Get user ID from auth
    // 2. Query positions from database
    // 3. Support filters: ?status=open&limit=50
    // 4. Return with P&L calculations
    // STUB:
    res.json({
        positions: [
            {
                id: 'pos-1',
                pair: 'PEPE/ETH',
                status: 'open',
                entryAmount: 1000,
                currentPnL: 45.50,
                pnlPercent: 4.55
            }
        ],
        message: 'TODO: Paste your working position listing code here'
    });
});
// ============================================================================
// CLOSE POSITION
// POST /api/arbwatch/positions/:id/close — Close a position
// TODO: Add withSubscription('arbwatch', 'pro')
// ============================================================================
router.post('/positions/:id/close', async (req, res) => {
    // TODO: Paste your working position closing code here
    // Your code should:
    // 1. Validate position exists and is open
    // 2. Calculate final P&L
    // 3. Update position status
    // 4. Return closed position
    //
    // AFTER PASTE: Gate with: withSubscription('arbwatch', 'pro')
    // STUB:
    res.json({
        id: req.params.id,
        status: 'closed',
        exitPrice: 0.00000130,
        finalPnL: 52.00,
        closedAt: new Date().toISOString(),
        message: 'TODO: Paste your working close position code here (Premium)'
    });
});
// ============================================================================
// EXECUTE TRADE
// POST /api/arbwatch/execute — Execute arbitrage trade
// TODO: Add withSubscription('arbwatch', 'pro') — execution is premium only
// ============================================================================
router.post('/execute', async (req, res) => {
    // TODO: Paste your working trade execution code here
    // Your code should:
    // 1. Validate opportunity is still valid
    // 2. Execute buy on one market
    // 3. Execute sell on another market
    // 4. Log results
    // 5. Return execution report
    //
    // AFTER PASTE: Gate with: withSubscription('arbwatch', 'pro')
    // STUB:
    res.json({
        executed: false,
        message: 'TODO: Paste your working execution code here (Premium only)',
        note: 'This should call your trading APIs'
    });
});
exports.default = router;
//# sourceMappingURL=arbwatch.js.map
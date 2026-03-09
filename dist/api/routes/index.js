"use strict";
/**
 * API Routes Registry
 * Mounts all canary app routes
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
// Import canary app routes
const botindex_1 = __importDefault(require("./botindex"));
const botindex_sports_1 = __importDefault(require("./botindex-sports"));
const botindex_crypto_1 = __importDefault(require("./botindex-crypto"));
const botindex_genesis_1 = __importDefault(require("./botindex-genesis"));
const botindex_commerce_1 = __importDefault(require("./botindex-commerce"));
const botindex_zora_1 = __importDefault(require("./botindex-zora"));
const botindex_hyperliquid_1 = __importDefault(require("./botindex-hyperliquid"));
const botindex_aztec_1 = __importDefault(require("./botindex-aztec"));
const botindex_base_1 = __importDefault(require("./botindex-base"));
const botindex_solana_anchor_1 = __importDefault(require("./botindex-solana-anchor"));
const botindex_aliases_1 = __importDefault(require("./botindex-aliases"));
const botindex_social_1 = __importDefault(require("./botindex-social"));
const botindex_doppler_1 = __importDefault(require("./botindex-doppler"));
const botindex_hip6_1 = __importDefault(require("./botindex-hip6"));
const botindex_hip4_1 = __importDefault(require("./botindex-hip4"));
const botindex_trust_1 = __importDefault(require("./botindex-trust"));
const botindex_pumpfun_1 = __importDefault(require("./botindex-pumpfun"));
const x402_test_1 = __importDefault(require("./x402-test"));
const x402_premium_1 = __importDefault(require("./x402-premium"));
const memeradar_1 = __importDefault(require("./memeradar"));
const arbwatch_1 = __importDefault(require("./arbwatch"));
const skinsignal_1 = __importDefault(require("./skinsignal"));
const payments_global_1 = __importDefault(require("./payments-global"));
const payments_1 = __importDefault(require("./payments"));
const contracts_1 = __importDefault(require("./contracts"));
const shell_1 = __importDefault(require("./shell"));
const signals_1 = __importDefault(require("./signals"));
const arb_1 = __importDefault(require("./arb"));
const botindex_keys_1 = __importDefault(require("./botindex-keys"));
const admin_dashboard_1 = __importDefault(require("./admin-dashboard"));
const botindex_beacon_1 = __importDefault(require("./botindex-beacon"));
const apiKeyAuth_1 = require("../middleware/apiKeyAuth");
const router = (0, express_1.Router)();
// Beacon must be before auth — it's a public tracking pixel
router.use('/', botindex_beacon_1.default);
// Global optional API key auth so paid subscribers bypass x402 pay-per-call gates.
router.use(apiKeyAuth_1.optionalApiKey, (req, _res, next) => {
    if (req.apiKeyAuth) {
        req.__apiKeyAuthenticated = true;
        req.__freeTrialAuthenticated = true;
        req.__billingMode = 'subscription';
    }
    next();
});
router.use('/botindex/keys', botindex_keys_1.default);
// Domain-centric BotIndex routes (canonical)
router.use('/botindex', botindex_zora_1.default);
router.use('/botindex', botindex_hyperliquid_1.default);
router.use('/botindex', botindex_aztec_1.default);
router.use('/botindex', botindex_base_1.default);
router.use('/botindex', botindex_solana_anchor_1.default);
router.use('/botindex', botindex_sports_1.default);
router.use('/botindex', botindex_crypto_1.default);
router.use('/botindex', botindex_doppler_1.default);
router.use('/botindex', botindex_hip6_1.default);
router.use('/botindex', botindex_hip4_1.default);
router.use('/botindex', botindex_trust_1.default);
router.use('/botindex', botindex_pumpfun_1.default);
router.use('/botindex', botindex_commerce_1.default);
router.use('/botindex/genesis', botindex_genesis_1.default);
router.use('/botindex/signals', signals_1.default);
router.use('/botindex/signals/premium', x402_premium_1.default);
router.use('/botindex/signals/x402', x402_test_1.default);
router.use('/botindex/crypto/meme-signals', memeradar_1.default);
router.use('/botindex/sports/arbitrage', arbwatch_1.default);
router.use('/botindex/sports/arbitrage', arb_1.default);
router.use('/botindex/commerce/price-tracking', skinsignal_1.default);
// Top-level branded aliases (discoverable names)
router.use('/botindex', botindex_aliases_1.default);
// Social sentiment pipeline
router.use('/botindex', botindex_social_1.default);
// Legacy BotIndex + v1/x402 aliases
router.use('/botindex', botindex_1.default);
// Legacy app-centric aliases (backward compatibility)
router.use('/memeradar', memeradar_1.default);
router.use('/arbwatch', arbwatch_1.default);
router.use('/skinsignal', skinsignal_1.default);
router.use('/signals', signals_1.default);
router.use('/arb', arb_1.default);
// App-scoped payment routes (config/status/checkout/portal/webhook/admin)
router.use('/', payments_1.default);
// Global payments helper routes
router.use('/payments', payments_global_1.default);
// Cross-repo route contracts for UI shells
router.use('/contracts', contracts_1.default);
// Shell endpoints for landing/dashboard rollouts
router.use('/', shell_1.default);
// Admin dashboard (traffic, conversions, funnel)
router.use('/admin/dashboard', admin_dashboard_1.default);
// (beacon mounted above auth layer)
// TODO: Add remaining 12 apps here
// router.use('/spreadhunter', spreadhunterRouter);
// router.use('/deckvault', deckvaultRouter);
// etc.
exports.default = router;
//# sourceMappingURL=index.js.map
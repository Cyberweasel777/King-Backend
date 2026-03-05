/**
 * Global payments routes
 *
 * Minimal checkout URL creator for canary.
 * Mounted at /api/payments
 *
 * GET /api/payments/checkout?app=<botindex|memeradar|arbwatch|spreadhunter|rosterradar>&tier=<starter|pro|elite|basic>&user=<externalUserId>
 * Returns: { url }
 */
declare const router: import("express-serve-static-core").Router;
export default router;
//# sourceMappingURL=payments-global.d.ts.map
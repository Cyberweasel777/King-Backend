"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const router = (0, express_1.Router)();
// 1x1 transparent GIF
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
/**
 * Beacon endpoint for PolyHacks landing page tracking.
 * Accepts query params: page, ref, utm_source, utm_medium, utm_campaign, utm_term, utm_content, gclid, fbclid
 * The hitCounter middleware already records the visit — this just returns a pixel.
 */
router.get('/polyhacks/beacon', (req, res) => {
    // Set no-cache headers
    res.set({
        'Content-Type': 'image/gif',
        'Content-Length': String(PIXEL.length),
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Access-Control-Allow-Origin': '*',
    });
    res.end(PIXEL);
});
exports.default = router;
//# sourceMappingURL=polyhacks-beacon.js.map
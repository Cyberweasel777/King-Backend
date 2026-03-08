import { Router } from 'express';

const router = Router();

// 1x1 transparent GIF
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

/**
 * Beacon endpoint for landing page tracking.
 * Accepts query params: page, ref, utm_source, utm_medium, utm_campaign
 * The hitCounter middleware already records the visit — this just returns a pixel.
 */
router.get('/botindex/beacon', (req, res) => {
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

export default router;

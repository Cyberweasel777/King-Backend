import assert from 'node:assert/strict';
import { rankScannerOpportunities } from './scanner';

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

  const opportunities = rankScannerOpportunities(points as any, {
    limit: 10,
    minEdgePct: 0.1,
    maxPerEvent: 10,
  });

  assert.equal(opportunities.length, 1);
  assert.equal(opportunities[0].buy.venue, 'polymarket');
  assert.equal(opportunities[0].sell.venue, 'kalshi');
  assert.ok(opportunities[0].grossEdgePct > 20);
  assert.ok(opportunities[0].netEdgePct > 20);

  const filtered = rankScannerOpportunities(points as any, {
    limit: 10,
    minEdgePct: 99,
    maxPerEvent: 10,
  });
  assert.equal(filtered.length, 0);

  console.log('scanner.test.ts passed');
}

run();

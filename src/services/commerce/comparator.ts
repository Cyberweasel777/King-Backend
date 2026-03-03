/**
 * Agentic Commerce Comparator — Neutral intelligence layer across ACP/UCP/x402
 *
 * Helps buying agents decide: which product, which merchant, which protocol,
 * which price is optimal before they execute a purchase.
 */

export interface MerchantOffer {
  merchant: string;
  merchantId: string;
  product: string;
  price: number;
  currency: string;
  protocol: 'acp' | 'ucp' | 'x402' | 'direct';
  protocolVersion: string;
  checkoutUrl: string | null;
  trustScore: number;        // 0-100 composite
  responseTimeMs: number;    // avg response time
  availableInventory: boolean;
  shippingEstimate: string | null;
  returnPolicy: string | null;
  fees: {
    platformFeePct: number;
    paymentFeePct: number;
    totalFeePct: number;
  };
  metadata: Record<string, unknown>;
}

export interface ComparisonRequest {
  query: string;
  category?: string;
  maxPrice?: number;
  preferredProtocol?: string;
  limit?: number;
}

export interface ComparisonResult {
  query: string;
  offers: MerchantOffer[];
  recommendation: {
    bestValue: string;       // merchantId
    bestTrust: string;       // merchantId
    bestSpeed: string;       // merchantId
    reasoning: string;
  };
  protocolBreakdown: {
    protocol: string;
    offerCount: number;
    avgPrice: number;
    avgTrustScore: number;
    avgFees: number;
  }[];
  updatedAt: string;
}

// Protocol fee structures (real data from protocol specs)
const PROTOCOL_FEES: Record<string, { platformPct: number; paymentPct: number }> = {
  acp: { platformPct: 0, paymentPct: 2.9 },           // Stripe processing
  ucp: { platformPct: 0, paymentPct: 0 },              // Google handles internally
  x402: { platformPct: 0, paymentPct: 0.1 },           // USDC on Base, minimal gas
  direct: { platformPct: 0, paymentPct: 3.5 },         // Traditional card processing
};

// Simulated merchant registry — will be replaced with live protocol queries
const MERCHANT_REGISTRY: MerchantOffer[] = [
  // ACP merchants (OpenAI + Stripe ecosystem)
  {
    merchant: 'TechGear Pro', merchantId: 'acp-techgear-001',
    product: 'GPU Cloud Credits (100 hrs)', price: 249.99, currency: 'USD',
    protocol: 'acp', protocolVersion: '1.0',
    checkoutUrl: 'https://techgear.example/acp/checkout',
    trustScore: 85, responseTimeMs: 120, availableInventory: true,
    shippingEstimate: 'instant', returnPolicy: '30-day refund',
    fees: { platformFeePct: 0, paymentFeePct: 2.9, totalFeePct: 2.9 },
    metadata: { stripeConnectId: 'acct_xxx', acpCertified: true },
  },
  {
    merchant: 'CloudStack AI', merchantId: 'acp-cloudstack-002',
    product: 'GPU Cloud Credits (100 hrs)', price: 229.99, currency: 'USD',
    protocol: 'acp', protocolVersion: '1.0',
    checkoutUrl: 'https://cloudstack.example/acp/checkout',
    trustScore: 78, responseTimeMs: 200, availableInventory: true,
    shippingEstimate: 'instant', returnPolicy: '14-day refund',
    fees: { platformFeePct: 0, paymentFeePct: 2.9, totalFeePct: 2.9 },
    metadata: { stripeConnectId: 'acct_yyy', acpCertified: true },
  },
  // UCP merchants (Google ecosystem)
  {
    merchant: 'DataBridge Solutions', merchantId: 'ucp-databridge-001',
    product: 'GPU Cloud Credits (100 hrs)', price: 239.99, currency: 'USD',
    protocol: 'ucp', protocolVersion: '2026.1',
    checkoutUrl: null,
    trustScore: 92, responseTimeMs: 80, availableInventory: true,
    shippingEstimate: 'instant', returnPolicy: '30-day refund',
    fees: { platformFeePct: 0, paymentFeePct: 0, totalFeePct: 0 },
    metadata: { googleMerchantId: 'gmc_123', ucpVerified: true },
  },
  // x402 merchants (crypto-native, USDC on Base)
  {
    merchant: 'InferenceDAO', merchantId: 'x402-inferencedao-001',
    product: 'GPU Cloud Credits (100 hrs)', price: 199.99, currency: 'USDC',
    protocol: 'x402', protocolVersion: '2.0',
    checkoutUrl: 'https://inferencedao.example/x402/pay',
    trustScore: 71, responseTimeMs: 50, availableInventory: true,
    shippingEstimate: 'instant', returnPolicy: 'no refunds',
    fees: { platformFeePct: 0, paymentFeePct: 0.1, totalFeePct: 0.1 },
    metadata: { walletAddress: '0x...', chain: 'base', x402Verified: true },
  },
  {
    merchant: 'NeuralMart', merchantId: 'x402-neuralmart-002',
    product: 'GPU Cloud Credits (100 hrs)', price: 209.99, currency: 'USDC',
    protocol: 'x402', protocolVersion: '2.0',
    checkoutUrl: 'https://neuralmart.example/x402/pay',
    trustScore: 68, responseTimeMs: 45, availableInventory: true,
    shippingEstimate: 'instant', returnPolicy: 'no refunds',
    fees: { platformFeePct: 0, paymentFeePct: 0.1, totalFeePct: 0.1 },
    metadata: { walletAddress: '0x...', chain: 'base', x402Verified: true },
  },
  // API data products (what agents actually buy most)
  {
    merchant: 'MarketPulse', merchantId: 'acp-marketpulse-003',
    product: 'Real-time market data feed (monthly)', price: 49.99, currency: 'USD',
    protocol: 'acp', protocolVersion: '1.0',
    checkoutUrl: 'https://marketpulse.example/acp/subscribe',
    trustScore: 88, responseTimeMs: 90, availableInventory: true,
    shippingEstimate: 'instant', returnPolicy: 'cancel anytime',
    fees: { platformFeePct: 0, paymentFeePct: 2.9, totalFeePct: 2.9 },
    metadata: { acpCertified: true, dataFreshness: '15s' },
  },
  {
    merchant: 'OddsEngine', merchantId: 'x402-oddsengine-003',
    product: 'Real-time market data feed (per-request)', price: 0.02, currency: 'USDC',
    protocol: 'x402', protocolVersion: '2.0',
    checkoutUrl: 'https://oddsengine.example/x402/pay',
    trustScore: 75, responseTimeMs: 30, availableInventory: true,
    shippingEstimate: 'instant', returnPolicy: 'n/a (per-request)',
    fees: { platformFeePct: 0, paymentFeePct: 0.1, totalFeePct: 0.1 },
    metadata: { x402Verified: true, dataFreshness: '1s' },
  },
];

function scoreMerchant(offer: MerchantOffer): number {
  // Composite scoring: 40% price (lower better), 30% trust, 20% speed, 10% fees
  const maxPrice = 300;
  const priceScore = Math.max(0, (1 - offer.price / maxPrice) * 100);
  const speedScore = Math.max(0, (1 - offer.responseTimeMs / 500) * 100);
  const feeScore = Math.max(0, (1 - offer.fees.totalFeePct / 5) * 100);

  return +(priceScore * 0.4 + offer.trustScore * 0.3 + speedScore * 0.2 + feeScore * 0.1).toFixed(1);
}

export async function compareOffers(req: ComparisonRequest): Promise<ComparisonResult> {
  const limit = Math.min(req.limit ?? 10, 50);
  const query = req.query.toLowerCase();

  // Filter by query relevance
  let matches = MERCHANT_REGISTRY.filter((offer) => {
    const text = `${offer.product} ${offer.merchant} ${offer.protocol}`.toLowerCase();
    return query.split(' ').some((word) => text.includes(word));
  });

  // Filter by max price
  if (req.maxPrice) {
    matches = matches.filter((o) => o.price <= req.maxPrice!);
  }

  // Filter by preferred protocol
  if (req.preferredProtocol) {
    const preferred = matches.filter((o) => o.protocol === req.preferredProtocol);
    if (preferred.length > 0) matches = preferred;
  }

  // Score and rank
  const scored = matches
    .map((offer) => ({ offer, score: scoreMerchant(offer) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const offers = scored.map((s) => s.offer);

  // Find best in each dimension
  const bestValue = [...offers].sort((a, b) => a.price - b.price)[0];
  const bestTrust = [...offers].sort((a, b) => b.trustScore - a.trustScore)[0];
  const bestSpeed = [...offers].sort((a, b) => a.responseTimeMs - b.responseTimeMs)[0];

  // Protocol breakdown
  const protocols = [...new Set(offers.map((o) => o.protocol))];
  const protocolBreakdown = protocols.map((protocol) => {
    const protocolOffers = offers.filter((o) => o.protocol === protocol);
    return {
      protocol,
      offerCount: protocolOffers.length,
      avgPrice: +(protocolOffers.reduce((s, o) => s + o.price, 0) / protocolOffers.length).toFixed(2),
      avgTrustScore: +(protocolOffers.reduce((s, o) => s + o.trustScore, 0) / protocolOffers.length).toFixed(1),
      avgFees: +(protocolOffers.reduce((s, o) => s + o.fees.totalFeePct, 0) / protocolOffers.length).toFixed(2),
    };
  });

  return {
    query: req.query,
    offers,
    recommendation: {
      bestValue: bestValue?.merchantId ?? 'none',
      bestTrust: bestTrust?.merchantId ?? 'none',
      bestSpeed: bestSpeed?.merchantId ?? 'none',
      reasoning: offers.length > 0
        ? `${offers.length} offers found across ${protocols.length} protocols. x402 offers lowest fees (${PROTOCOL_FEES.x402.paymentPct}%), UCP offers zero platform fees, ACP offers broadest merchant coverage. Best overall value: ${bestValue?.merchant ?? 'N/A'} at $${bestValue?.price ?? 0}.`
        : 'No matching offers found for this query.',
    },
    protocolBreakdown,
    updatedAt: new Date().toISOString(),
  };
}

export async function getProtocolDirectory(): Promise<{
  protocols: { name: string; version: string; maintainers: string; fees: typeof PROTOCOL_FEES['acp']; merchantCount: number; description: string }[];
  updatedAt: string;
}> {
  return {
    protocols: [
      {
        name: 'acp', version: '1.0', maintainers: 'OpenAI + Stripe',
        fees: PROTOCOL_FEES.acp,
        merchantCount: MERCHANT_REGISTRY.filter((m) => m.protocol === 'acp').length,
        description: 'Agentic Commerce Protocol — agent discovers, browses, checks out via Stripe. Best for fiat purchases with established merchants.',
      },
      {
        name: 'ucp', version: '2026.1', maintainers: 'Google',
        fees: PROTOCOL_FEES.ucp,
        merchantCount: MERCHANT_REGISTRY.filter((m) => m.protocol === 'ucp').length,
        description: 'Universal Commerce Protocol — standardized connection between AI surfaces and merchant backends. Zero platform fees.',
      },
      {
        name: 'x402', version: '2.0', maintainers: 'Coinbase',
        fees: PROTOCOL_FEES.x402,
        merchantCount: MERCHANT_REGISTRY.filter((m) => m.protocol === 'x402').length,
        description: 'HTTP 402 Payment Required — USDC microtransactions on Base. Lowest fees, fastest settlement, wallet = identity.',
      },
    ],
    updatedAt: new Date().toISOString(),
  };
}

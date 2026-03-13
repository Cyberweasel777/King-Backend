import { Router } from 'express';

const router = Router();

/**
 * MCP Tool Catalog — Single source of truth for all BotIndex MCP tools.
 * The npm MCP server fetches this at startup to dynamically register tools.
 * Add new tools here and they propagate to ALL MCP distributions automatically.
 */
router.get('/mcp-catalog', (_req, res) => {
  res.json({
    version: '2.0.0',
    updated: new Date().toISOString(),
    notes: {
      mcpFreeTier: 'MCP free tier: 5 tool/resource calls per UTC day per IP. Use X-API-Key for unlimited MCP access.',
    },
    tools: [
      // ── Sports ──
      {
        name: 'botindex_sports_odds',
        description: 'Live sports odds snapshot (NFL, NBA, UFC, NHL). Moneyline, spread, totals with bookmaker comparisons. $0.02',
        path: '/sports/odds',
        params: [{ name: 'sport', type: 'string', description: 'Filter by sport: nfl, nba, ufc, nhl', required: false }],
      },
      {
        name: 'botindex_sports_lines',
        description: 'Line movements with sharp money action flags. Identifies professional bettor market impact. $0.02',
        path: '/sports/lines',
      },
      {
        name: 'botindex_sports_props',
        description: 'Top prop bet movements with confidence scores. Player prop market value signals. $0.02',
        path: '/sports/props',
      },
      {
        name: 'botindex_sports_correlations',
        description: 'Player correlation matrix for DFS and correlated betting. Shows co-performance patterns. $0.05',
        path: '/sports/correlations',
      },
      {
        name: 'botindex_dfs_optimizer',
        description: 'Correlation-adjusted DFS lineup optimizer. Returns optimized lineups accounting for player correlations. $0.10',
        path: '/sports/optimizer',
        params: [
          { name: 'budget', type: 'number', description: 'Salary cap budget', required: false },
          { name: 'sport', type: 'string', description: 'Target sport', required: false },
        ],
      },
      {
        name: 'botindex_arb_scanner',
        description: 'Cross-platform prediction market and sportsbook arbitrage scanner. $0.05',
        path: '/sports/arb',
      },

      // ── Crypto ──
      {
        name: 'botindex_crypto_tokens',
        description: 'Token universe with latest price data from MemeRadar correlation engine. $0.02',
        path: '/crypto/tokens',
      },
      {
        name: 'botindex_crypto_graduating',
        description: 'Token graduation signals from Catapult launchpad to Hyperliquid mainnet via GradSniper. $0.02',
        path: '/crypto/graduating',
      },
      {
        name: 'botindex_meme_velocity',
        description: 'Cross-platform meme token velocity scanner. Detects sudden volume/price spikes across DexScreener, Zora, and Pump.fun. $0.02',
        path: '/meme/velocity',
        params: [
          { name: 'chain', type: 'string', description: 'Filter chain: base, solana, eth', required: false, enum: ['base', 'solana', 'eth'] },
          { name: 'min_score', type: 'number', description: 'Minimum velocity score filter', required: false },
          { name: 'limit', type: 'number', description: 'Max results (default 200)', required: false },
        ],
      },
      {
        name: 'botindex_stablecoin_flows',
        description: 'Large stablecoin transfer monitor for USDC/USDT on Base and Ethereum with whale/exchange/bridge flow labels. $0.02',
        path: '/stablecoin/flows',
        params: [
          { name: 'chain', type: 'string', description: 'Filter chain: base, ethereum, all', required: false, enum: ['base', 'ethereum', 'all'] },
          { name: 'min_usd', type: 'number', description: 'Minimum transfer size in USD', required: false },
          { name: 'limit', type: 'number', description: 'Max results (default 50)', required: false },
        ],
      },

      // ── Solana ──
      {
        name: 'botindex_solana_launches',
        description: 'All tracked Metaplex Genesis token launches on Solana mainnet. $0.02',
        path: '/solana/launches',
      },
      {
        name: 'botindex_solana_active',
        description: 'Currently active Metaplex Genesis launches on Solana (filtered by status). $0.02',
        path: '/solana/active',
      },

      // ── Commerce ──
      {
        name: 'botindex_commerce_compare',
        description: 'Compare merchant offers across agentic commerce protocols (ACP, UCP, x402). Ranked offers with trust scores, fees, checkout protocol details. $0.05',
        path: '/commerce/compare',
        params: [
          { name: 'q', type: 'string', description: 'Product search query', required: true },
          { name: 'maxPrice', type: 'number', description: 'Maximum price filter', required: false },
          { name: 'protocol', type: 'string', description: 'Preferred checkout protocol', required: false, enum: ['acp', 'ucp', 'x402'] },
          { name: 'limit', type: 'number', description: 'Max results (default 10, max 50)', required: false },
        ],
      },
      {
        name: 'botindex_commerce_protocols',
        description: 'Directory of agentic commerce protocols — ACP (OpenAI+Stripe), UCP (Google), x402 (Coinbase) with fee structures and merchant counts. $0.01',
        path: '/commerce/protocols',
      },

      // ── Premium ──
      {
        name: 'botindex_signals',
        description: 'Aggregated premium signals: correlation leaders + prediction arbitrage + market heatmap. $0.10',
        path: '/signals',
      },
      {
        name: 'botindex_agent_trace',
        description: 'Premium reasoning trace for a specific agent. $0.05',
        path: '/trace',
        params: [{ name: 'agentId', type: 'string', description: 'Agent ID', required: true, enum: ['spreadhunter', 'rosterradar', 'arbwatch', 'memeradar', 'botindex'] }],
      },
      {
        name: 'botindex_dashboard',
        description: 'Full premium dashboard — all agents, traces, correlation matrices, prediction arb, heatmaps. $0.50',
        path: '/dashboard',
      },

      // ── Zora ──
      {
        name: 'botindex_zora_trending_coins',
        description: 'Trending Zora attention market coins by volume velocity. $0.03',
        path: '/zora/trending-coins',
        params: [{ name: 'limit', type: 'number', description: 'Max results (default 20)', required: false }],
      },
      {
        name: 'botindex_zora_creator_scores',
        description: 'Creator performance scores on Zora. Top-performing creators by attention metrics. $0.03',
        path: '/zora/creator-scores',
        params: [{ name: 'limit', type: 'number', description: 'Max results (default 20)', required: false }],
      },
      {
        name: 'botindex_zora_attention_momentum',
        description: 'Attention momentum — which Zora trends are accelerating. Early signal for emerging attention markets. $0.03',
        path: '/zora/attention-momentum',
        params: [{ name: 'limit', type: 'number', description: 'Max results (default 20)', required: false }],
      },

      // ── Hyperliquid ──
      {
        name: 'botindex_hl_funding_arb',
        description: 'Funding rate arbitrage opportunities between Hyperliquid and major CEXs. $0.05',
        path: '/hyperliquid/funding-arb',
      },
      {
        name: 'botindex_hl_correlation_matrix',
        description: 'Hyperliquid perpetual correlation matrix for portfolio construction. $0.05',
        path: '/hyperliquid/correlation-matrix',
      },
      {
        name: 'botindex_hl_liquidation_heatmap',
        description: 'Liquidation cluster heatmap by price level. Predicts support/resistance zones. $0.05',
        path: '/hyperliquid/liquidation-heatmap',
      },
      {
        name: 'botindex_hl_whale_alerts',
        description: 'Hyperliquid whale alert summary — top whale positions and recent large trade count. Tracks $187M+ in whale positions. FREE (3/day).',
        path: '/hyperliquid/whale-alerts',
      },
      {
        name: 'botindex_hl_whale_alerts_full',
        description: 'Full Hyperliquid whale positions + recent large trades. Entry prices, leverage, PnL, liquidation levels. $0.05',
        path: '/hyperliquid/whale-alerts/full',
      },
      {
        name: 'botindex_hl_coin_analytics',
        description: 'Deep analytics for a specific Hyperliquid coin. OI, funding, volume, liquidation history. $0.05',
        path: '/hyperliquid/coin-analytics',
        params: [{ name: 'address', type: 'string', description: 'Coin address or symbol (e.g., "BTC", "ETH")', required: true }],
      },

      // ── Doppler ──
      {
        name: 'botindex_doppler_launches',
        description: 'Recent Doppler token launches on Base. New creator coins via Doppler liquidity protocol. $0.01',
        path: '/doppler/launches',
        params: [{ name: 'limit', type: 'number', description: 'Max results (default 10)', required: false }],
      },

      // ── Intel (DeepSeek AI premium) ──
      {
        name: 'botindex_zora_intel',
        description: 'AI-powered Zora market intelligence. Risk scores, fair value estimates, creator grades, BUY/WATCH/FADE signals. $0.05',
        path: '/zora/intel',
      },
      {
        name: 'botindex_hyperliquid_intel',
        description: 'AI-powered Hyperliquid funding rate intelligence. Rate persistence prediction, optimal entry timing. $0.05',
        path: '/hyperliquid/intel',
      },
      {
        name: 'botindex_crypto_intel',
        description: 'AI-powered crypto correlation intelligence. Regime detection, portfolio risk clusters, alpha opportunities. $0.05',
        path: '/crypto/intel',
      },
      {
        name: 'botindex_doppler_intel',
        description: 'AI-powered Doppler launch intelligence. Quality scores, rug probability, creator analysis. $0.05',
        path: '/doppler/intel',
      },
    ],
  });
});

export default router;

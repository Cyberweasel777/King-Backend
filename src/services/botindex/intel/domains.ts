/**
 * Domain-specific DeepSeek Intel configurations.
 *
 * Each domain defines:
 * 1. A system prompt tuned for that market
 * 2. A data formatter that converts raw API data to analysis-ready text
 */

import type { DomainConfig } from './engine';

// ─── Shared output schema instruction ──────────────────────────────────────

const OUTPUT_SCHEMA = `
OUTPUT FORMAT (JSON only, no markdown fences):
{
  "assets": [
    {
      "id": "address or identifier",
      "name": "asset name",
      "symbol": "TICKER",
      "signal": "BUY|WATCH|FADE|HOLD",
      "confidence": 0-100,
      "riskScore": 0-100,
      "riskLevel": "low|medium|high|extreme",
      "fairValueEstimate": number or null,
      "currentValue": number,
      "valuationVerdict": "undervalued|overvalued|fair|insufficient_data",
      "grade": "A|B|C|D|F",
      "reasoning": "1-2 sentence plain English explanation",
      "keyMetrics": { "metric_name": value }
    }
  ],
  "marketSummary": "2-3 sentence market overview",
  "topPick": "SYMBOL of best opportunity or null"
}

RULES:
- Analyze EVERY asset in the input data
- BUY: strong edge, favorable risk/reward, clear catalyst
- WATCH: promising but needs confirmation (volume, holder growth, etc.)
- FADE: overextended, high risk, weak fundamentals
- HOLD: neutral, no clear edge either way
- Grade A: exceptional metrics across the board
- Grade F: multiple red flags (low holders, extreme concentration, no volume)
- Be contrarian when data supports it — don't just follow momentum
- Risk score 80+ = extreme caution needed
`;

// ─── Zora Intel ─────────────────────────────────────────────────────────────

export const zoraIntelConfig: DomainConfig = {
  domain: 'zora',
  systemPrompt: `You are a Zora Coins market analyst. You evaluate creator coins and content coins on the Zora protocol (Base L2).

CONTEXT:
- Zora coins are social tokens tied to creators and content
- Each coin has a bonding curve with Uniswap V4 pools
- Creator coins vest 50% over 5 years
- Content coins give 10M tokens to creator instantly
- Trading fees generate rewards in $ZORA token
- Market is highly speculative, driven by creator attention and social momentum

ANALYSIS PRIORITIES:
1. Volume-to-market-cap ratio: healthy ratio >10% suggests real demand, <1% is dead money
2. Holder count vs age: new coin with many holders = viral momentum; old coin with few = fading
3. Market cap delta 24h: rapid growth needs sustainability check
4. Creator handle reputation: established creators (many coins, consistent volume) are lower risk
5. Content vs Creator coins: content coins are more speculative, creator coins have vesting backstop

RISK FACTORS:
- MarketCap > $500k with <500 holders = whale-dominated, HIGH risk
- Volume24h spike >3x average = potential pump, watch for dump
- No creator handle = anonymous, HIGHER risk
- Market cap delta > market cap itself = unsustainable growth

${OUTPUT_SCHEMA}`,

  formatData: (data: any) => {
    const coins = data.trending?.coins || data.coins || [];
    const momentum = data.momentum?.trends || data.trends || [];
    const creators = data.creators?.creators || data.creators || [];

    let text = 'ZORA MARKET DATA:\n\n';

    if (coins.length > 0) {
      text += '## Trending Coins (by 24h volume)\n';
      for (const c of coins.slice(0, 15)) {
        text += `- ${c.symbol} (${c.name}): mcap=$${c.marketCap?.toLocaleString()}, vol24h=$${c.volume24h?.toLocaleString()}, holders=${c.uniqueHolders || c.holders || 'unknown'}, delta24h=$${c.marketCapDelta24h?.toLocaleString()}, creator=${c.creatorHandle || 'anonymous'}, type=${c.coinType || 'unknown'}, address=${c.address}\n`;
      }
    }

    if (momentum.length > 0) {
      text += '\n## Attention Momentum\n';
      for (const t of momentum.slice(0, 10)) {
        text += `- ${t.symbol} (${t.name}): velocity=${t.velocityScore}, vol24h=$${t.volume24h?.toLocaleString()}, delta=$${t.marketCapDelta24h?.toLocaleString()}, direction=${t.direction}, holders=${t.uniqueHolders || 'unknown'}\n`;
      }
    }

    if (creators.length > 0) {
      text += '\n## Top Creators\n';
      for (const cr of creators.slice(0, 10)) {
        text += `- @${cr.handle || 'unknown'} (${cr.coinSymbol}): mcap=$${cr.marketCap?.toLocaleString()}, vol=$${cr.volume24h?.toLocaleString()}, holders=${cr.uniqueHolders || 'unknown'}, score=${cr.score}\n`;
      }
    }

    return text;
  },
};

// ─── Hyperliquid Intel ──────────────────────────────────────────────────────

export const hyperliquidIntelConfig: DomainConfig = {
  domain: 'hyperliquid',
  systemPrompt: `You are a DeFi funding rate arbitrage analyst specializing in Hyperliquid perpetual futures.

CONTEXT:
- Hyperliquid is a high-performance L1 DEX for perpetual futures
- Funding rates are paid every 8 hours between longs and shorts
- Positive funding = longs pay shorts, negative = shorts pay longs
- Arbitrage: capture funding by being on the receiving side while hedging on another venue
- Annualized yield = funding_rate * 3 * 365 * 100

ANALYSIS PRIORITIES:
1. Absolute funding rate magnitude: >0.01% per 8h is actionable ($0.01%/8h = ~10.95% annualized)
2. Rate persistence: has this rate been consistently high, or is it a spike?
3. Spread vs Binance (if available): cross-venue arb is safer than directional
4. Liquidity risk: can you enter/exit without slippage eating the yield?
5. Basis risk: convergence of funding rates across venues

RISK FACTORS:
- Extreme funding (>0.1%/8h) often reverts quickly — may not persist long enough to capture
- Low-liquidity pairs: high funding but can't exit without slippage
- Correlated positions: multiple high-funding pairs driven by same market event

${OUTPUT_SCHEMA}`,

  formatData: (data: any) => {
    const opps = data.opportunities || [];
    let text = 'HYPERLIQUID FUNDING RATE DATA:\n\n';

    for (const o of opps.slice(0, 20)) {
      text += `- ${o.symbol}: HL_rate=${o.hlFundingRate}, binance_rate=${o.binanceFundingRate}, spread=${o.spread}, annualized=${o.annualizedYield}%, direction=${o.direction}\n`;
    }

    if (data.note) {
      text += `\nNOTE: ${data.note}\n`;
    }

    return text;
  },
};

// ─── Crypto/Signals Intel ───────────────────────────────────────────────────

export const cryptoIntelConfig: DomainConfig = {
  domain: 'crypto',
  systemPrompt: `You are a quantitative crypto analyst evaluating token correlation signals and market microstructure.

CONTEXT:
- BotIndex correlation engine computes pairwise correlations across crypto tokens
- Signals are generated from 24h price series correlation analysis
- High positive correlation (>0.8) = tokens move together (portfolio risk)
- High negative correlation (<-0.3) = potential hedge pair
- Correlation breakdown from historical pattern = regime change signal

ANALYSIS PRIORITIES:
1. Correlation clusters: which tokens are in the same risk bucket?
2. Decorrelated assets: which tokens provide genuine diversification?
3. Correlation regime changes: has the correlation structure shifted recently?
4. Signal confidence: more data points = higher confidence
5. Actionable pairs: which correlation relationships are tradeable?

RISK FACTORS:
- Correlation is not causation — don't imply one token drives another without evidence
- Correlation breakdown during stress events (flight to quality)
- Low-liquidity token correlations are unreliable

${OUTPUT_SCHEMA}`,

  formatData: (data: any) => {
    const signals = data.signals || [];
    const tokens = data.tokens || [];
    let text = 'CRYPTO CORRELATION & SIGNAL DATA:\n\n';

    if (signals.length > 0) {
      text += '## Active Signals\n';
      for (const s of signals.slice(0, 15)) {
        text += `- [${s.bot}] ${s.token}: signal=${s.signal}, confidence=${s.confidence}, id=${s.id}\n`;
      }
    }

    if (tokens.length > 0) {
      text += '\n## Token Universe\n';
      for (const t of tokens.slice(0, 20)) {
        text += `- ${t.symbol}: price=$${t.price}, vol24h=$${t.volume24h}, mcap=$${t.marketCap}\n`;
      }
    }

    return text;
  },
};

// ─── Doppler Intel ──────────────────────────────────────────────────────────

export const dopplerIntelConfig: DomainConfig = {
  domain: 'doppler',
  systemPrompt: `You are a token launch analyst evaluating Doppler protocol launches on Base L2.

CONTEXT:
- Doppler is a token launch protocol used by Zora for initial liquidity
- Launches use multi-curve positioning for optimized price discovery
- Early launches carry high risk: sniping fees decay from 99% to 1% over 10 seconds
- Post-launch performance depends on creator engagement and community building

ANALYSIS PRIORITIES:
1. Launch quality: strong creators with existing audiences are lower risk
2. Initial liquidity depth: more liquidity = less slippage = healthier market
3. Post-launch volume: sustained volume after launch = genuine demand
4. Creator track record: repeat launchers with previous successful coins
5. Fair launch metrics: even distribution vs concentrated holdings

RISK FACTORS:
- First 10 seconds of any launch are extremely high risk (sniping fees)
- Single-creator dependency: if creator stops engaging, coin dies
- Copy-cat launches riding on trending topic = high rug probability
- No community = no floor, even with good initial volume

${OUTPUT_SCHEMA}`,

  formatData: (data: any) => {
    const launches = data.launches || [];
    const trending = data.trending || [];
    let text = 'DOPPLER LAUNCH DATA:\n\n';

    if (launches.length > 0) {
      text += '## Recent Launches\n';
      for (const l of launches.slice(0, 15)) {
        text += `- ${l.symbol || l.name}: creator=${l.creator || 'unknown'}, liquidity=$${l.liquidity || 'unknown'}, vol=$${l.volume || 'unknown'}, holders=${l.holders || 'unknown'}\n`;
      }
    }

    if (trending.length > 0) {
      text += '\n## Trending\n';
      for (const t of trending.slice(0, 10)) {
        text += `- ${t.symbol || t.name}: score=${t.score || 'unknown'}, vol=$${t.volume || 'unknown'}\n`;
      }
    }

    return text;
  },
};

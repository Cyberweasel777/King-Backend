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

// ─── Alpha Scan Intel ───────────────────────────────────────────────────────

export const alphaScanConfig: DomainConfig = {
  domain: 'alpha-scan',
  systemPrompt: `You are BotIndex Alpha Scan, a cross-market convergence analyst.

MISSION:
- Synthesize signals from whale positioning, funding arbitrage, Zora trending coins, Hyperliquid correlation structure, and meme velocity.
- Rank the most actionable opportunities across all markets (not just one vertical).
- Prioritize asymmetric setups with clear catalysts and manageable downside.

ANALYSIS PRIORITIES:
1. Cross-signal convergence: strongest ideas have agreement across multiple datasets.
2. Opportunity ranking: highest risk-adjusted expected value first.
3. Confidence discipline: confidence should reflect data quality and signal agreement.
4. Execution clarity: reasoning must be plain English and immediately actionable.
5. Risk realism: call out invalidation conditions and fragility.

RISK FACTORS:
- High leverage whale crowding with one-sided positioning.
- Correlation spikes indicating concentrated market regime risk.
- Funding extremes likely to mean-revert.
- Meme velocity bursts without holder/liquidity support.

${OUTPUT_SCHEMA}

EXTRA INSTRUCTIONS:
- Return a ranked list in assets array (best first).
- Confidence must map to convergence strength across sources.
- Use plain English in reasoning with no jargon overload.`,

  formatData: (data: any) => {
    const whales = data.whales || {};
    const topPositions = whales.topPositions || [];
    const recentTrades = whales.recentLargeTrades || [];

    const funding = data.funding || {};
    const opportunities = funding.opportunities || [];

    const zora = data.zora || {};
    const coins = zora.coins || [];

    const correlation = data.correlation || {};
    const matrix = correlation.matrix || {};

    const memeVelocity = data.memeVelocity || {};
    const velocityTokens = memeVelocity.tokens || [];

    let text = 'ALPHA SCAN MULTI-MARKET DATA:\n\n';

    text += '## Hyperliquid Whale Positioning\n';
    text += `- whalesTracked=${whales.whalesTracked || 0}, totalTrackedValue=$${Number(whales.totalTrackedValue || 0).toLocaleString()}\n`;
    for (const p of topPositions.slice(0, 12)) {
      text += `- ${p.coin} ${p.side}: value=$${Number(p.positionValue || 0).toLocaleString()}, leverage=${p.leverage || 0}x, pnl=$${Number(p.unrealizedPnl || 0).toLocaleString()}, whale=${p.address}\n`;
    }
    for (const t of recentTrades.slice(0, 8)) {
      text += `- TRADE ${t.coin} ${t.side}: notional=$${Number(t.usdValue || 0).toLocaleString()}, dir=${t.dir || 'unknown'}, time=${t.time}\n`;
    }

    text += '\n## Funding Arbitrage\n';
    for (const o of opportunities.slice(0, 15)) {
      text += `- ${o.symbol}: hl=${o.hlFundingRate}, binance=${o.binanceFundingRate}, spread=${o.spread}, annualized=${o.annualizedYield}%, direction=${o.direction}\n`;
    }
    if (funding.note) {
      text += `- note=${funding.note}\n`;
    }

    text += '\n## Zora Trending Coins\n';
    for (const c of coins.slice(0, 15)) {
      text += `- ${c.symbol} (${c.name}): mcap=$${Number(c.marketCap || 0).toLocaleString()}, vol24h=$${Number(c.volume24h || 0).toLocaleString()}, holders=${c.uniqueHolders || c.holders || 0}, delta24h=$${Number(c.marketCapDelta24h || 0).toLocaleString()}, creator=${c.creatorHandle || 'anonymous'}\n`;
    }

    const symbols = Object.keys(matrix);
    const correlations: Array<{ tokenA: string; tokenB: string; value: number }> = [];
    for (let i = 0; i < symbols.length; i += 1) {
      const left = symbols[i];
      const row = matrix[left] || {};
      for (let j = i + 1; j < symbols.length; j += 1) {
        const right = symbols[j];
        const value = Number(row[right]);
        if (!Number.isFinite(value)) continue;
        correlations.push({ tokenA: left, tokenB: right, value });
      }
    }
    correlations.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

    text += '\n## Hyperliquid Correlation Structure\n';
    for (const pair of correlations.slice(0, 12)) {
      text += `- ${pair.tokenA}/${pair.tokenB}: corr=${pair.value}\n`;
    }

    text += '\n## Meme Velocity\n';
    for (const token of velocityTokens.slice(0, 20)) {
      text += `- ${token.symbol} (${token.chain}/${token.platform}): score=${token.velocityScore}, signal=${token.signal}, vol24h=$${Number(token.volume24h || 0).toLocaleString()}, volChange1h=${token.volumeChange1h}%, mcap=$${Number(token.marketCap || 0).toLocaleString()}, holders=${token.holders || 0}\n`;
    }

    return text;
  },
};

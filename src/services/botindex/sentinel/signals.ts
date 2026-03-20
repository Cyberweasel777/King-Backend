/**
 * Sentinel Intelligence Service — Proprietary predictive signals.
 *
 * Synthesizes query surge data, market data, and social sentiment
 * through DeepSeek to produce actionable intelligence briefs.
 *
 * Data sources:
 * - Query surge patterns (proprietary "network momentum")
 * - Market data (DexScreener, CoinGecko, DeFiLlama, Fear & Greed)
 * - Whale positions (Hyperliquid)
 * - Social sentiment (Reddit, GitHub, npm trends via SearXNG)
 * - Risk radar scores
 *
 * Output: scored signals with DeepSeek-synthesized narratives.
 */

import fs from 'fs';
import path from 'path';
import logger from '../../../config/logger';
import { getHyperliquidWhaleAlerts } from '../hyperliquid/whale-alerts';
import { getFundingArbOpportunities } from '../hyperliquid/funding-arb';
import { getTrending, getPrices } from '../coingecko-cache';
import { queueSignalForRelay } from './public-channel-relay';
import { collectEcosystemIntel, EcosystemData } from './ecosystem-intel';

const DATA_DIR = process.env.DATA_DIR || '/data';
const SENTINEL_LOG = path.join(DATA_DIR, 'sentinel-signals.jsonl');
const SENTINEL_ALERTS_LOG = path.join(DATA_DIR, 'sentinel-alerts.jsonl');
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const TELEGRAM_BOT_TOKEN = process.env.BOTINDEX_BOT_TOKEN || '';
const ANDREW_CHAT_ID = '8063432083';
const FETCH_TIMEOUT_MS = 15_000;
const CACHE_TTL_MS = 5 * 60 * 1000;

// Cache
let signalCache: { data: SentinelReport | null; expiresAt: number } = { data: null, expiresAt: 0 };

// ── Types ──────────────────────────────────────────────────────────────

export interface SentinelSignal {
  id: string;
  type: 'momentum_surge' | 'momentum_decay' | 'risk_cascade' | 'sentiment_shift' | 'whale_divergence' | 'dump_warning' | 'pump_signal';
  asset: string;
  strength: number; // 0-100
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: 'high' | 'medium' | 'low';
  timeframe: string;
  narrative: string; // DeepSeek-generated explanation
  evidence: string[];
  actionable: string;
}

export interface SentinelReport {
  timestamp: string;
  market_regime: 'risk_on' | 'risk_off' | 'neutral' | 'transitioning';
  regime_confidence: number;
  signals: SentinelSignal[];
  synthesis: string; // DeepSeek-generated market narrative
  alert_level: 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';
  metadata: {
    sources_queried: number;
    sources_ok: number;
    deepseek_used: boolean;
    latency_ms: number;
  };
}

// ── Helpers ────────────────────────────────────────────────────────────

function appendJsonl(filePath: string, data: unknown): void {
  try { fs.appendFileSync(filePath, JSON.stringify(data) + '\n'); } catch { /* non-fatal */ }
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<globalThis.Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try { return await fetch(url, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

async function safeFetchJson<T>(url: string, label: string): Promise<T | null> {
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) { logger.warn({ url, status: res.status, label }, 'Sentinel source error'); return null; }
    return (await res.json()) as T;
  } catch (err) {
    logger.warn({ url, err: err instanceof Error ? err.message : String(err), label }, 'Sentinel fetch failed');
    return null;
  }
}

// ── Data Collection ────────────────────────────────────────────────────

interface CollectedData {
  querySurges: Array<{ endpoint: string; count: number; windowStart: string }>;
  whales: { topPositions: Array<{ coin: string; side: string; positionValue: number }>; summary: string } | null;
  funding: { opportunities: Array<{ symbol: string; hlFundingRate: number; annualizedYield: number; direction: string }> } | null;
  fearGreed: { value: number; classification: string } | null;
  trending: Array<{ name: string; symbol: string; priceChange24h: number; marketCapRank: number }>;
  tvlMovers: Array<{ name: string; symbol: string; change1d: number; tvl: number }>;
  npmTrends: string | null;
  redditSentiment: string | null;
  ecosystem: EcosystemData | null;
  sourcesOk: number;
}

async function collectAllData(): Promise<CollectedData> {
  let sourcesOk = 0;

  // Read latest query surge data from JSONL (last 6 entries = 30 min)
  let querySurges: CollectedData['querySurges'] = [];
  try {
    const surgeFile = path.join(DATA_DIR, 'query-surge-history.jsonl');
    if (fs.existsSync(surgeFile)) {
      const lines = fs.readFileSync(surgeFile, 'utf-8').trim().split('\n').slice(-6);
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (entry.windows) {
            for (const w of entry.windows) {
              querySurges.push({ endpoint: w.endpoint, count: w.count, windowStart: w.windowStart });
            }
          }
        } catch { /* skip malformed */ }
      }
      sourcesOk++;
    }
  } catch { /* non-fatal */ }

  // Parallel fetch all external sources
  // Ecosystem intelligence (GitHub + npm) — runs in parallel with other fetches
  let ecosystem: EcosystemData | null = null;
  const ecosystemPromise = collectEcosystemIntel().then(d => { ecosystem = d; sourcesOk += d.sourcesOk > 0 ? 1 : 0; }).catch(err => {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'Ecosystem intel failed');
  });

  const [whaleResult, fundingResult, fngResult, trendingResult, protocolsResult, npmResult, redditResult] = await Promise.all([
    getHyperliquidWhaleAlerts().then(d => { sourcesOk++; return d; }).catch(() => null),
    getFundingArbOpportunities().then(d => { sourcesOk++; return d; }).catch(() => null),
    safeFetchJson<{ data: Array<{ value: string; value_classification: string }> }>('https://api.alternative.me/fng/?limit=1', 'fear-greed'),
    getTrending() as Promise<{ coins: Array<{ item: { name: string; symbol: string; market_cap_rank: number; data?: { price_change_percentage_24h?: Record<string, number> } } }> } | null>,
    safeFetchJson<Array<{ name: string; symbol: string; tvl: number; change_1d: number }>>('https://api.llama.fi/protocols', 'defillama'),
    // SearXNG for npm/GitHub sentiment (lightweight query)
    safeFetchJson<{ results?: Array<{ title: string; content: string }> }>('http://127.0.0.1:8888/search?q=crypto+crash+dump+warning+2026&format=json&categories=general&engines=reddit,google&language=en', 'searxng-sentiment'),
    safeFetchJson<{ results?: Array<{ title: string; content: string }> }>('http://127.0.0.1:8888/search?q=crypto+bullish+pump+breakout+2026&format=json&categories=general&engines=reddit,google&language=en', 'searxng-bullish'),
  ]);

  // Process Fear & Greed
  let fearGreed: CollectedData['fearGreed'] = null;
  if (fngResult?.data?.[0]) {
    sourcesOk++;
    fearGreed = { value: parseInt(fngResult.data[0].value, 10), classification: fngResult.data[0].value_classification };
  }

  // Process trending
  let trending: CollectedData['trending'] = [];
  if (trendingResult?.coins) {
    sourcesOk++;
    trending = trendingResult.coins.slice(0, 10).map(c => ({
      name: c.item.name,
      symbol: c.item.symbol.toUpperCase(),
      priceChange24h: c.item.data?.price_change_percentage_24h?.usd || 0,
      marketCapRank: c.item.market_cap_rank || 999,
    }));
  }

  // Process TVL movers
  let tvlMovers: CollectedData['tvlMovers'] = [];
  if (protocolsResult && Array.isArray(protocolsResult)) {
    sourcesOk++;
    tvlMovers = protocolsResult
      .filter(p => p.tvl > 1_000_000 && p.change_1d !== undefined && Math.abs(p.change_1d) >= 10)
      .sort((a, b) => Math.abs(b.change_1d) - Math.abs(a.change_1d))
      .slice(0, 10)
      .map(p => ({ name: p.name, symbol: p.symbol || '?', change1d: p.change_1d, tvl: p.tvl }));
  }

  // Process social sentiment
  const bearishHits = npmResult?.results?.length || 0;
  const bullishHits = redditResult?.results?.length || 0;
  const npmTrends = npmResult?.results ? npmResult.results.slice(0, 3).map(r => r.title).join(' | ') : null;
  const redditSentiment = redditResult?.results ? redditResult.results.slice(0, 3).map(r => r.title).join(' | ') : null;
  if (npmTrends || redditSentiment) sourcesOk++;

  // Wait for ecosystem intel to finish
  await ecosystemPromise;

  return {
    querySurges,
    whales: whaleResult ? { topPositions: whaleResult.topPositions.map(p => ({ coin: p.coin, side: p.side, positionValue: p.positionValue })), summary: whaleResult.summary } : null,
    funding: fundingResult ? { opportunities: fundingResult.opportunities.slice(0, 10).map(o => ({ symbol: o.symbol, hlFundingRate: o.hlFundingRate, annualizedYield: o.annualizedYield, direction: o.direction })) } : null,
    fearGreed,
    trending,
    tvlMovers,
    npmTrends,
    redditSentiment,
    ecosystem,
    sourcesOk,
  };
}

// ── DeepSeek Synthesis ─────────────────────────────────────────────────

async function synthesizeWithDeepSeek(data: CollectedData): Promise<{ signals: SentinelSignal[]; synthesis: string; regime: string; alertLevel: string } | null> {
  if (!DEEPSEEK_API_KEY) {
    logger.warn('No DEEPSEEK_API_KEY — skipping synthesis');
    return null;
  }

  const prompt = `You are Sentinel, a proprietary crypto market intelligence engine. Analyze the following multi-source data and produce actionable trading intelligence.

DATA INPUTS:

1. NETWORK MOMENTUM (proprietary — request volume patterns across our API network in last 30 min):
${JSON.stringify(data.querySurges.slice(-20), null, 0)}

2. WHALE POSITIONS (Hyperliquid top 10 traders):
${data.whales ? JSON.stringify(data.whales, null, 0) : 'unavailable'}

3. FUNDING RATES (Hyperliquid vs Binance spreads):
${data.funding ? JSON.stringify(data.funding.opportunities.slice(0, 5), null, 0) : 'unavailable'}

4. FEAR & GREED INDEX:
${data.fearGreed ? `${data.fearGreed.value}/100 (${data.fearGreed.classification})` : 'unavailable'}

5. TRENDING TOKENS (CoinGecko):
${JSON.stringify(data.trending.slice(0, 7), null, 0)}

6. TVL MOVERS (DeFiLlama — protocols with >10% daily TVL change):
${JSON.stringify(data.tvlMovers.slice(0, 5), null, 0)}

7. SOCIAL SENTIMENT (bearish signals):
${data.npmTrends || 'none detected'}

8. SOCIAL SENTIMENT (bullish signals):
${data.redditSentiment || 'none detected'}

9. ECOSYSTEM INTELLIGENCE (GitHub dev activity + npm download velocity — LEADING INDICATOR):
${data.ecosystem ? (() => {
  const hotRepos = data.ecosystem.repos
    .filter((r: any) => r.commitsRecent > 0)
    .sort((a: any, b: any) => b.commitsRecent - a.commitsRecent)
    .slice(0, 8)
    .map((r: any) => `${r.repo}(${r.asset}): ${r.stars.toLocaleString()}★, ${r.commitsRecent} commits/7d`);
  const hotNpm = data.ecosystem.npm
    .filter((n: any) => n.weeklyDownloads > 0)
    .sort((a: any, b: any) => b.growthPct - a.growthPct)
    .slice(0, 8)
    .map((n: any) => `${n.pkg}(${n.asset}): ${n.weeklyDownloads.toLocaleString()}/wk ${n.growthPct > 0 ? '+' : ''}${n.growthPct.toFixed(1)}%`);
  return `GitHub: ${hotRepos.join(', ') || 'none'}\nnpm: ${hotNpm.join(', ') || 'none'}`;
})() : 'unavailable'}

OUTPUT FORMAT (strict JSON, no markdown):
{
  "market_regime": "risk_on|risk_off|neutral|transitioning",
  "regime_confidence": <0-100>,
  "alert_level": "GREEN|YELLOW|ORANGE|RED",
  "synthesis": "<2-3 sentence market narrative>",
  "signals": [
    {
      "type": "momentum_surge|momentum_decay|risk_cascade|sentiment_shift|whale_divergence|dump_warning|ecosystem_momentum",
      "asset": "<token/chain name>",
      "strength": <0-100>,
      "direction": "bullish|bearish|neutral",
      "confidence": "high|medium|low",
      "timeframe": "minutes|hours|days",
      "narrative": "<1 sentence explanation>",
      "evidence": ["<specific data point 1>", "<specific data point 2>"],
      "actionable": "<1 sentence what to do>"
    }
  ]
}

RULES:
- Generate 3-7 signals, ranked by strength
- Flag dump_warning signals when: extreme greed + whale concentration + high funding rates converge (BEARISH)
- DO NOT generate pump_signal type signals. This signal type is disabled until further notice. Skip it entirely.
- whale_divergence: when whale positions DIVERGE from price action. If whales are long while price drops, direction is BULLISH (smart money accumulating). If whales are short while price rises, direction is BEARISH. The direction should match WHERE THE WHALE IS POSITIONED, not the current price trend.
- IMPORTANT: whale_divergence direction = whale's bet direction, NOT current price direction
- Network momentum surges indicate pre-move developer interest
- Be specific about assets. "BTC" not "the market"
- ASSET DIVERSITY: Do NOT only generate BTC and ETH signals. Look at trending tokens, TVL movers, funding rate data, and ECOSYSTEM INTELLIGENCE for altcoins (SOL, AVAX, LINK, APT, SUI, etc). At least 1-2 signals per batch MUST be for non-BTC/ETH assets when the data supports it.
- ecosystem_momentum: Use this signal type when GitHub commit velocity, npm download growth, or developer activity for an asset is accelerating or decelerating significantly. Rising dev activity (commits up, downloads surging) = bullish leading indicator. Declining dev activity (commits dropping, downloads falling) = bearish. This is a LEADING indicator — developer activity often leads price by days or weeks.
- Be direct. No hedging language. State the signal clearly.
- If data is insufficient, lower confidence, don't hallucinate signals`;

  try {
    const res = await fetchWithTimeout(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      logger.warn({ status: res.status }, 'DeepSeek synthesis failed');
      return null;
    }

    const result = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = result.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content);
    return {
      signals: (parsed.signals || []).map((s: any, i: number) => ({
        id: `sentinel-${Date.now()}-${i}`,
        ...s,
      })),
      synthesis: parsed.synthesis || '',
      regime: parsed.market_regime || 'neutral',
      alertLevel: parsed.alert_level || 'GREEN',
    };
  } catch (err) {
    logger.error({ err }, 'DeepSeek synthesis error');
    return null;
  }
}

// ── Main Report Builder ────────────────────────────────────────────────

export async function buildSentinelReport(): Promise<SentinelReport> {
  const start = Date.now();
  const data = await collectAllData();
  const deepseekResult = await synthesizeWithDeepSeek(data);

  const report: SentinelReport = {
    timestamp: new Date().toISOString(),
    market_regime: (deepseekResult?.regime as SentinelReport['market_regime']) || 'neutral',
    regime_confidence: 50,
    signals: deepseekResult?.signals || [],
    synthesis: deepseekResult?.synthesis || 'Insufficient data for synthesis. Monitoring continues.',
    alert_level: (deepseekResult?.alertLevel as SentinelReport['alert_level']) || 'GREEN',
    metadata: {
      sources_queried: 8,
      sources_ok: data.sourcesOk,
      deepseek_used: !!deepseekResult,
      latency_ms: Date.now() - start,
    },
  };

  // Log to JSONL
  appendJsonl(SENTINEL_LOG, {
    timestamp: report.timestamp,
    regime: report.market_regime,
    alert_level: report.alert_level,
    signal_count: report.signals.length,
    deepseek_used: report.metadata.deepseek_used,
    latency_ms: report.metadata.latency_ms,
  });

  // Log verifiable predictions with entry prices
  try {
    const { logPredictions } = await import('./prediction-tracker');
    await logPredictions(report.signals);
  } catch (err) {
    logger.warn({ err }, 'Prediction logging failed (non-fatal)');
  }

  return report;
}

export async function getCachedSentinelReport(): Promise<SentinelReport> {
  const now = Date.now();
  if (signalCache.data && now < signalCache.expiresAt) {
    return JSON.parse(JSON.stringify(signalCache.data));
  }
  const report = await buildSentinelReport();
  signalCache = { data: report, expiresAt: now + CACHE_TTL_MS };
  return JSON.parse(JSON.stringify(report));
}

// ── Alert Feed (all subscribers) ───────────────────────────────────────

export async function sendPersonalSentinelAlert(): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) return;

  try {
    const report = await buildSentinelReport();

    // Only alert on YELLOW+ or if there are dump/pump signals
    const hasUrgent = report.signals.some(s => s.type === 'dump_warning' || s.type === 'pump_signal' || s.type === 'risk_cascade');
    if (report.alert_level === 'GREEN' && !hasUrgent) return;

    const alertEmoji = { GREEN: '🟢', YELLOW: '🟡', ORANGE: '🟠', RED: '🔴' }[report.alert_level] || '⚪';

    const lines = [
      `${alertEmoji} <b>Sentinel Intelligence Brief</b>`,
      `<b>Regime:</b> ${report.market_regime.toUpperCase()} | <b>Alert:</b> ${report.alert_level}`,
      '',
      `<i>${report.synthesis}</i>`,
      '',
    ];

    for (const s of report.signals.slice(0, 5)) {
      const typeEmoji = {
        dump_warning: '🔻',
        pump_signal: '🚀',
        risk_cascade: '⚠️',
        momentum_surge: '📈',
        momentum_decay: '📉',
        sentiment_shift: '🔄',
        whale_divergence: '🐋',
      }[s.type] || '•';

      lines.push(`${typeEmoji} <b>${s.asset}</b> [${s.strength}/100 ${s.direction}]`);
      lines.push(`   ${s.narrative}`);
      lines.push(`   → ${s.actionable}`);
      lines.push('');
    }

    // Add Network Intelligence rankings
    try {
      const { getCachedNetworkIntelligence } = await import('./network-intelligence');
      const intel = await getCachedNetworkIntelligence();
      lines.push('📡 <b>Network Intelligence</b>');
      for (const r of intel.rankings.slice(0, 5)) {
        const trendEmoji = { surging: '🚀', growing: '📈', stable: '➡️', declining: '📉', dormant: '💤' }[r.trend] || '•';
        lines.push(`  ${trendEmoji} ${r.ecosystem}: ${r.score}/100`);
      }
      lines.push('');
    } catch { /* non-fatal — network intel may not be ready */ }

    lines.push(`Sources: ${report.metadata.sources_ok}/8 | DeepSeek: ${report.metadata.deepseek_used ? '✅' : '❌'}`);

    const message = lines.join('\n');

    // Broadcast to all subscribers (Andrew + paid users)
    const { broadcastAlert } = await import('./telegram-subscribers');
    const sent = await broadcastAlert(message, 'pro');

    // Queue stronger signals for delayed public relay (supplementary channel)
    const publicRelayCandidates = report.signals.filter(s => s.strength >= 70);
    if (publicRelayCandidates.length > 0) {
      const prices = await getPrices(publicRelayCandidates.map(s => s.asset));
      for (const signal of publicRelayCandidates) {
        queueSignalForRelay({
          asset: signal.asset,
          signal_type: signal.type,
          direction: signal.direction,
          strength: signal.strength,
          narrative: signal.narrative,
          entry_price_usd: prices[signal.asset.toUpperCase()] ?? null,
          timestamp: report.timestamp,
        });
      }
    }

    appendJsonl(SENTINEL_ALERTS_LOG, {
      timestamp: report.timestamp,
      alert_level: report.alert_level,
      regime: report.market_regime,
      signals_count: report.signals.length,
      sent_to: sent,
    });

    logger.info({ alert_level: report.alert_level, signals: report.signals.length, sent_to: sent }, 'Sentinel alert broadcast');
  } catch (err) {
    logger.error({ err }, 'Sentinel alert broadcast failed');
  }
}

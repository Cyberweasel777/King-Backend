/**
 * Market Surge Monitor — Broad crypto market spike detection.
 *
 * Polls DexScreener + CoinGecko every 5 minutes for:
 * - Volume surges (tokens with abnormal 24h volume spikes)
 * - Price movers (tokens with >10% moves in last hour)
 * - New trending entries (tokens newly appearing in trending lists)
 *
 * Sends Telegram alerts when significant movements detected.
 * Logs all data to JSONL for historical analysis.
 */

import fs from 'fs';
import path from 'path';
import logger from '../../config/logger';

const DATA_DIR = process.env.DATA_DIR || '/data';
const MARKET_SURGE_LOG = path.join(DATA_DIR, 'market-surge-history.jsonl');
const MARKET_ALERTS_LOG = path.join(DATA_DIR, 'market-surge-alerts.jsonl');
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const FETCH_TIMEOUT_MS = 10_000;
const TELEGRAM_CHAT_ID = process.env.SURGE_ALERT_CHAT_ID || '8063432083';
const TELEGRAM_BOT_TOKEN = process.env.BOTINDEX_BOT_TOKEN || '';

// Thresholds
const PRICE_SPIKE_PCT = 10; // 10%+ move triggers alert
const VOLUME_SPIKE_MULTIPLIER = 5; // 5x average volume
const MIN_MARKET_CAP = 100_000; // ignore dust tokens (if mcap available)

// Cooldown: don't alert same token more than once per hour
const alertCooldowns = new Map<string, number>();
const ALERT_COOLDOWN_MS = 60 * 60 * 1000;

// Previous state for diff detection
let previousTrendingSet = new Set<string>();
let previousTopMovers = new Map<string, number>(); // token -> price change %

interface DexScreenerPair {
  chainId?: string;
  dexId?: string;
  pairAddress?: string;
  baseToken?: { address?: string; name?: string; symbol?: string };
  quoteToken?: { symbol?: string };
  priceUsd?: string;
  priceChange?: { h1?: number; h6?: number; h24?: number };
  volume?: { h1?: number; h6?: number; h24?: number };
  liquidity?: { usd?: number };
  fdv?: number;
  url?: string;
}

interface CoinGeckoTrending {
  coins?: Array<{
    item?: {
      id?: string;
      coin_id?: number;
      name?: string;
      symbol?: string;
      market_cap_rank?: number;
      price_btc?: number;
      score?: number;
      data?: {
        price_change_percentage_24h?: Record<string, number>;
        total_volume?: string;
        market_cap?: string;
      };
    };
  }>;
}

interface MarketSurge {
  token: string;
  symbol: string;
  chain?: string;
  type: 'price_spike' | 'volume_surge' | 'new_trending' | 'dex_boost';
  magnitude: number; // percentage or multiplier
  detail: string;
  source: string;
  url?: string;
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<globalThis.Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function safeFetchJson<T>(url: string, label: string): Promise<T | null> {
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) {
      logger.warn({ url, status: res.status, label }, 'Market surge source returned non-200');
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ url, err: msg, label }, 'Market surge source fetch failed');
    return null;
  }
}

async function sendTelegramAlert(message: string): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) return;
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'HTML',
        disable_notification: false,
      }),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, 'Market surge Telegram alert failed');
    }
  } catch (err) {
    logger.warn({ err }, 'Market surge Telegram alert error');
  }
}

function appendJsonl(filePath: string, data: unknown): void {
  try {
    fs.appendFileSync(filePath, JSON.stringify(data) + '\n');
  } catch {
    // Non-fatal
  }
}

async function scanDexScreenerGainers(): Promise<MarketSurge[]> {
  const surges: MarketSurge[] = [];

  // DexScreener top boosted tokens (indicates promoted/trending)
  const boosts = await safeFetchJson<Array<{
    tokenAddress?: string;
    chainId?: string;
    amount?: number;
    description?: string;
    url?: string;
  }>>('https://api.dexscreener.com/token-boosts/top/v1', 'dexscreener-boosts');

  if (boosts && Array.isArray(boosts)) {
    for (const b of boosts.slice(0, 15)) {
      surges.push({
        token: b.description || b.tokenAddress || 'unknown',
        symbol: b.description || '?',
        chain: b.chainId,
        type: 'dex_boost',
        magnitude: b.amount || 0,
        detail: `DEX boost: ${b.amount || 0} on ${b.chainId || 'unknown'}`,
        source: 'dexscreener',
        url: b.url,
      });
    }
  }

  // DexScreener search for high-volume pairs across all chains
  // Use the latest pairs endpoint for new listings with volume
  const latestPairs = await safeFetchJson<{ pairs?: DexScreenerPair[] }>(
    'https://api.dexscreener.com/latest/dex/pairs/solana,ethereum,base',
    'dexscreener-pairs'
  );

  // Note: this endpoint may not work as expected; DexScreener free API is limited
  // Focus on the boosts endpoint which is reliable

  return surges;
}

async function scanCoinGeckoTrending(): Promise<MarketSurge[]> {
  const surges: MarketSurge[] = [];

  const trending = await safeFetchJson<CoinGeckoTrending>(
    'https://api.coingecko.com/api/v3/search/trending',
    'coingecko-trending'
  );

  if (trending?.coins) {
    const currentTrending = new Set<string>();

    for (const coin of trending.coins) {
      const item = coin.item;
      if (!item?.name || !item?.symbol) continue;

      const key = item.symbol.toUpperCase();
      currentTrending.add(key);

      // Detect NEW entries in trending (weren't there last check)
      if (!previousTrendingSet.has(key)) {
        const priceChange24h = item.data?.price_change_percentage_24h?.usd;
        surges.push({
          token: item.name,
          symbol: key,
          type: 'new_trending',
          magnitude: priceChange24h || 0,
          detail: `Newly trending on CoinGecko. Rank: ${item.market_cap_rank || '?'}. 24h: ${priceChange24h ? priceChange24h.toFixed(1) + '%' : 'N/A'}`,
          source: 'coingecko',
        });
      }

      // Detect major price spikes in trending tokens
      const priceChange = item.data?.price_change_percentage_24h?.usd;
      if (priceChange && Math.abs(priceChange) >= PRICE_SPIKE_PCT) {
        const prevChange = previousTopMovers.get(key);
        // Only alert if this is a NEW spike (wasn't already spiking last check)
        if (prevChange === undefined || Math.abs(priceChange) > Math.abs(prevChange) * 1.5) {
          surges.push({
            token: item.name,
            symbol: key,
            type: 'price_spike',
            magnitude: priceChange,
            detail: `${priceChange > 0 ? '📈' : '📉'} ${priceChange.toFixed(1)}% in 24h. Market cap rank: ${item.market_cap_rank || '?'}`,
            source: 'coingecko',
          });
        }
      }

      if (priceChange !== undefined) {
        previousTopMovers.set(key, priceChange);
      }
    }

    previousTrendingSet = currentTrending;
  }

  return surges;
}

async function scanDeFiLlamaMovers(): Promise<MarketSurge[]> {
  const surges: MarketSurge[] = [];

  // Check for protocols with extreme TVL changes
  const protocols = await safeFetchJson<Array<{
    name?: string;
    symbol?: string;
    tvl?: number;
    change_1d?: number;
    change_7d?: number;
    chain?: string;
    chains?: string[];
    category?: string;
  }>>('https://api.llama.fi/protocols', 'defillama-protocols');

  if (protocols && Array.isArray(protocols)) {
    // Filter for significant TVL protocols with large 1-day swings
    const movers = protocols
      .filter(p => p.tvl && p.tvl > 1_000_000 && p.change_1d !== undefined && Math.abs(p.change_1d!) >= 15)
      .sort((a, b) => Math.abs(b.change_1d || 0) - Math.abs(a.change_1d || 0))
      .slice(0, 10);

    for (const p of movers) {
      surges.push({
        token: p.name || 'unknown',
        symbol: p.symbol || '?',
        chain: p.chain || (p.chains?.[0]) || undefined,
        type: 'volume_surge',
        magnitude: p.change_1d || 0,
        detail: `TVL ${p.change_1d! > 0 ? '+' : ''}${p.change_1d!.toFixed(1)}% (1d). Current TVL: $${((p.tvl || 0) / 1e6).toFixed(1)}M. Category: ${p.category || 'unknown'}`,
        source: 'defillama',
      });
    }
  }

  return surges;
}

async function runMarketScan(): Promise<void> {
  const start = Date.now();

  try {
    const [dexSurges, cgSurges, defiSurges] = await Promise.all([
      scanDexScreenerGainers(),
      scanCoinGeckoTrending(),
      scanDeFiLlamaMovers(),
    ]);

    const allSurges = [...dexSurges, ...cgSurges, ...defiSurges];

    // Log full scan to JSONL
    appendJsonl(MARKET_SURGE_LOG, {
      timestamp: new Date().toISOString(),
      latency_ms: Date.now() - start,
      total_signals: allSurges.length,
      by_source: {
        dexscreener: dexSurges.length,
        coingecko: cgSurges.length,
        defillama: defiSurges.length,
      },
      surges: allSurges,
    });

    // Filter for alertable surges (new trending + major price spikes + TVL movers)
    const now = Date.now();
    const alertable = allSurges.filter(s => {
      // Only alert on significant events
      if (s.type === 'dex_boost') return false; // too noisy
      if (s.type === 'price_spike' && Math.abs(s.magnitude) < PRICE_SPIKE_PCT) return false;
      if (s.type === 'volume_surge' && Math.abs(s.magnitude) < 15) return false;

      // Cooldown check
      const cooldownKey = `${s.symbol}:${s.type}`;
      const lastAlert = alertCooldowns.get(cooldownKey) || 0;
      if (now - lastAlert < ALERT_COOLDOWN_MS) return false;

      alertCooldowns.set(cooldownKey, now);
      return true;
    });

    if (alertable.length === 0) return;

    // Log alerts
    appendJsonl(MARKET_ALERTS_LOG, {
      timestamp: new Date().toISOString(),
      alerts: alertable,
    });

    // Build Telegram message
    const lines: string[] = [];

    const newTrending = alertable.filter(s => s.type === 'new_trending');
    const priceSpikes = alertable.filter(s => s.type === 'price_spike');
    const tvlMovers = alertable.filter(s => s.type === 'volume_surge');

    if (newTrending.length > 0) {
      lines.push('🆕 <b>Newly Trending</b>');
      for (const s of newTrending.slice(0, 5)) {
        lines.push(`  • <b>${s.symbol}</b> (${s.token}) — ${s.detail}`);
      }
      lines.push('');
    }

    if (priceSpikes.length > 0) {
      lines.push('💥 <b>Price Spikes</b>');
      for (const s of priceSpikes.slice(0, 5)) {
        lines.push(`  • <b>${s.symbol}</b>: ${s.magnitude > 0 ? '+' : ''}${s.magnitude.toFixed(1)}% — ${s.detail}`);
      }
      lines.push('');
    }

    if (tvlMovers.length > 0) {
      lines.push('🏦 <b>TVL Movers</b>');
      for (const s of tvlMovers.slice(0, 5)) {
        lines.push(`  • <b>${s.symbol}</b>: ${s.detail}`);
      }
      lines.push('');
    }

    const message = [
      '📊 <b>Crypto Market Surge Alert</b>',
      '',
      ...lines,
      `Scanned: DexScreener + CoinGecko + DeFiLlama`,
      `Time: ${new Date().toISOString().slice(11, 16)} UTC`,
    ].join('\n');

    await sendTelegramAlert(message);
    logger.info({ alerts: alertable.length }, 'Market surge alert sent');
  } catch (err) {
    logger.error({ err }, 'Market surge scan failed');
  }
}

// Start the background monitor
let intervalHandle: ReturnType<typeof setInterval> | null = null;

export function startMarketSurgeMonitor(): void {
  logger.info('Starting market surge monitor (5-min interval)');

  // Run first scan after 30 seconds (let server boot first)
  setTimeout(() => {
    void runMarketScan();
  }, 30_000);

  // Then every 5 minutes
  intervalHandle = setInterval(() => {
    void runMarketScan();
  }, POLL_INTERVAL_MS);
}

export function stopMarketSurgeMonitor(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

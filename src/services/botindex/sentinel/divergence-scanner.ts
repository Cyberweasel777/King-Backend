/**
 * Divergence Scanner — Andrew's personal contrarian signal feed.
 *
 * Detects when three conditions converge on any asset/ecosystem:
 * 1. Whales are holding/accumulating (on-chain + Hyperliquid positions)
 * 2. Devs are building (GitHub commits, npm downloads trending up)
 * 3. Fear is growing (Fear & Greed dropping, social sentiment bearish, price declining)
 *
 * When all three align = strongest contrarian buy signal.
 * When inverse (whales dumping + devs leaving + euphoria) = distribution/top signal.
 *
 * Runs every 30 min. Only sends alerts when divergence is detected.
 * Output: Telegram messages to Andrew via @BotIndexHacks_Bot.
 */

import fs from 'fs';
import path from 'path';
import logger from '../../../config/logger';

const DATA_DIR = process.env.DATA_DIR || '/data';
const DIVERGENCE_LOG = path.join(DATA_DIR, 'divergence-signals.jsonl');
const TELEGRAM_BOT_TOKEN = process.env.BOTINDEX_BOT_TOKEN || '';
const ANDREW_CHAT_ID = '8063432083';
const GH_TOKEN = process.env.GH_TOKEN || '';
const FETCH_TIMEOUT_MS = 12_000;
const SCAN_INTERVAL_MS = 30 * 60 * 1000; // 30 min
const COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hour cooldown per asset

const lastAlerted = new Map<string, number>();

// ── Types ──────────────────────────────────────────────────────────────

interface AssetDivergence {
  asset: string;
  type: 'accumulation_divergence' | 'distribution_divergence';
  whale_signal: { direction: 'accumulating' | 'distributing' | 'neutral'; evidence: string[]; score: number };
  dev_signal: { direction: 'building' | 'stalling' | 'leaving'; evidence: string[]; score: number };
  fear_signal: { direction: 'fearful' | 'greedy' | 'neutral'; evidence: string[]; score: number };
  convergence_strength: number; // 0-100
  verdict: string;
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

async function safeFetchJson<T>(url: string, headers?: Record<string, string>): Promise<T | null> {
  try {
    const res = await fetchWithTimeout(url, { headers });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch { return null; }
}

// ── Data Collection ────────────────────────────────────────────────────

interface WhaleData {
  positions: Array<{ coin: string; side: string; positionValue: number; pnl: number }>;
  netFlow: Map<string, 'accumulating' | 'distributing' | 'neutral'>;
}

async function getWhalePositions(): Promise<WhaleData | null> {
  try {
    const res = await fetchWithTimeout('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'clearinghouseState', user: '0x0000000000000000000000000000000000000000' }),
    });

    // Use the leaderboard endpoint instead for aggregate whale data
    const leaderboardRes = await fetchWithTimeout('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'leaderboard', timeWindow: 'day' }),
    });

    if (!leaderboardRes.ok) return null;
    const leaderboard = await leaderboardRes.json() as { leaderboardRows?: Array<{ ethAddress: string; accountValue: string; displayName?: string }> };

    // Get top 10 whale positions
    const topWhales = (leaderboard.leaderboardRows || []).slice(0, 10);
    const positions: WhaleData['positions'] = [];
    const netFlow = new Map<string, 'accumulating' | 'distributing' | 'neutral'>();

    // Fetch positions for top 5 whales
    for (const whale of topWhales.slice(0, 5)) {
      try {
        const posRes = await fetchWithTimeout('https://api.hyperliquid.xyz/info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'clearinghouseState', user: whale.ethAddress }),
        });
        if (!posRes.ok) continue;
        const posData = await posRes.json() as { assetPositions?: Array<{ position: { coin: string; szi: string; unrealizedPnl: string; positionValue: string } }> };

        for (const ap of (posData.assetPositions || [])) {
          const pos = ap.position;
          const size = parseFloat(pos.szi);
          if (Math.abs(size) < 0.01) continue;

          positions.push({
            coin: pos.coin,
            side: size > 0 ? 'long' : 'short',
            positionValue: Math.abs(parseFloat(pos.positionValue)),
            pnl: parseFloat(pos.unrealizedPnl),
          });
        }
      } catch { continue; }
    }

    // Aggregate: if most whales are long on an asset, it's accumulating
    const coinSides = new Map<string, { long: number; short: number; totalValue: number }>();
    for (const p of positions) {
      const existing = coinSides.get(p.coin) || { long: 0, short: 0, totalValue: 0 };
      if (p.side === 'long') existing.long += p.positionValue;
      else existing.short += p.positionValue;
      existing.totalValue += p.positionValue;
      coinSides.set(p.coin, existing);
    }

    for (const [coin, data] of coinSides) {
      const ratio = data.totalValue > 0 ? data.long / (data.long + data.short) : 0.5;
      if (ratio > 0.65) netFlow.set(coin, 'accumulating');
      else if (ratio < 0.35) netFlow.set(coin, 'distributing');
      else netFlow.set(coin, 'neutral');
    }

    return { positions, netFlow };
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'Whale data fetch failed');
    return null;
  }
}

interface DevActivity {
  ecosystem: string;
  assets: string[]; // which coins this ecosystem maps to
  recentPushes: number; // repos pushed in last 7 days
  weeklyDownloads: number;
  stars: number;
  direction: 'building' | 'stalling' | 'leaving';
}

const ECOSYSTEM_ASSET_MAP: Array<{ name: string; assets: string[]; orgs: string[]; repos: string[]; npm: string[] }> = [
  { name: 'Bitcoin', assets: ['BTC'], orgs: ['bitcoin', 'bitcoin-core'], repos: ['AstarNetwork/astar-frame', 'nicklash/bitcoinj'], npm: ['bitcoinjs-lib', '@scure/btc-signer'] },
  { name: 'Ethereum', assets: ['ETH'], orgs: ['ethereum'], repos: ['foundry-rs/foundry', 'OpenZeppelin/openzeppelin-contracts'], npm: ['ethers', 'viem'] },
  { name: 'Solana', assets: ['SOL'], orgs: ['solana-labs'], repos: ['coral-xyz/anchor'], npm: ['@solana/web3.js', '@coral-xyz/anchor'] },
  { name: 'Kaspa', assets: ['KAS'], orgs: ['kaspanet'], repos: [], npm: ['kaspa'] },
  { name: 'Hyperliquid', assets: ['HYPE', 'PURR'], orgs: ['hyperliquid-dex'], repos: [], npm: ['hyperliquid'] },
  { name: 'Zora', assets: ['ZORA'], orgs: ['ourzora'], repos: [], npm: ['@zoralabs/protocol-sdk'] },
  { name: 'Base/Coinbase', assets: ['BASE'], orgs: ['base-org'], repos: ['coinbase/onchainkit'], npm: ['@coinbase/onchainkit'] },
  { name: 'Aave', assets: ['AAVE'], orgs: ['aave'], repos: [], npm: ['@aave/contract-helpers'] },
  { name: 'Uniswap', assets: ['UNI'], orgs: ['Uniswap'], repos: [], npm: ['@uniswap/sdk-core'] },
  { name: 'Chainlink', assets: ['LINK'], orgs: ['smartcontractkit'], repos: [], npm: ['@chainlink/contracts'] },
  { name: 'Arbitrum', assets: ['ARB'], orgs: ['OffchainLabs'], repos: [], npm: [] },
  { name: 'Optimism', assets: ['OP'], orgs: ['ethereum-optimism'], repos: [], npm: [] },
  { name: 'Polygon', assets: ['POL', 'MATIC'], orgs: ['0xPolygon'], repos: [], npm: [] },
];

async function getDevActivity(): Promise<DevActivity[]> {
  const results: DevActivity[] = [];
  const ghHeaders: Record<string, string> = { 'Accept': 'application/vnd.github+json' };
  if (GH_TOKEN) ghHeaders['Authorization'] = `Bearer ${GH_TOKEN}`;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Process in batches of 3 to avoid GitHub rate limits
  for (let i = 0; i < ECOSYSTEM_ASSET_MAP.length; i += 3) {
    const batch = ECOSYSTEM_ASSET_MAP.slice(i, i + 3);
    const batchResults = await Promise.all(batch.map(async (eco) => {
      let recentPushes = 0;
      let stars = 0;
      let totalDownloads = 0;

      // GitHub org repos
      for (const org of eco.orgs) {
        try {
          const repos = await safeFetchJson<Array<{ stargazers_count: number; pushed_at: string }>>(
            `https://api.github.com/orgs/${org}/repos?sort=pushed&per_page=15`, ghHeaders
          );
          if (repos) {
            for (const r of repos) {
              stars += r.stargazers_count;
              if (r.pushed_at > sevenDaysAgo) recentPushes++;
            }
          }
        } catch { /* skip */ }
      }

      // Specific repos
      for (const repo of eco.repos) {
        try {
          const r = await safeFetchJson<{ stargazers_count: number; pushed_at: string }>(
            `https://api.github.com/repos/${repo}`, ghHeaders
          );
          if (r) {
            stars += r.stargazers_count;
            if (r.pushed_at > sevenDaysAgo) recentPushes++;
          }
        } catch { /* skip */ }
      }

      // npm downloads
      for (const pkg of eco.npm) {
        try {
          const encoded = encodeURIComponent(pkg);
          const d = await safeFetchJson<{ downloads: number }>(`https://api.npmjs.org/downloads/point/last-week/${encoded}`);
          if (d) totalDownloads += d.downloads || 0;
        } catch { /* skip */ }
      }

      const direction: DevActivity['direction'] =
        recentPushes >= 5 ? 'building' :
        recentPushes >= 1 ? 'stalling' :
        'leaving';

      return {
        ecosystem: eco.name,
        assets: eco.assets,
        recentPushes,
        weeklyDownloads: totalDownloads,
        stars,
        direction,
      };
    }));
    results.push(...batchResults);
  }

  return results;
}

interface FearData {
  fngValue: number; // 0-100
  fngClassification: string;
  btcPriceChange24h: number | null;
  ethPriceChange24h: number | null;
}

async function getFearSignals(): Promise<FearData | null> {
  const [fng, btcData, ethData] = await Promise.all([
    safeFetchJson<{ data: Array<{ value: string; value_classification: string }> }>('https://api.alternative.me/fng/?limit=1'),
    safeFetchJson<Record<string, { usd_24h_change?: number }>>('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true'),
    safeFetchJson<Record<string, { usd_24h_change?: number }>>('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd&include_24hr_change=true'),
  ]);

  if (!fng?.data?.[0]) return null;

  return {
    fngValue: parseInt(fng.data[0].value, 10),
    fngClassification: fng.data[0].value_classification,
    btcPriceChange24h: btcData?.bitcoin?.usd_24h_change ?? null,
    ethPriceChange24h: ethData?.ethereum?.usd_24h_change ?? null,
  };
}

// ── Divergence Detection ───────────────────────────────────────────────

function detectDivergences(
  whaleData: WhaleData | null,
  devActivity: DevActivity[],
  fearData: FearData | null,
): AssetDivergence[] {
  const divergences: AssetDivergence[] = [];

  for (const dev of devActivity) {
    for (const asset of dev.assets) {
      // Whale signal for this asset
      const whaleDir = whaleData?.netFlow.get(asset) || 'neutral';
      const whalePositions = whaleData?.positions.filter(p => p.coin === asset) || [];
      const totalWhaleValue = whalePositions.reduce((s, p) => s + p.positionValue, 0);

      const whaleScore =
        whaleDir === 'accumulating' ? 80 :
        whaleDir === 'distributing' ? 20 : 50;
      const whaleEvidence: string[] = [];
      if (whaleDir !== 'neutral') {
        whaleEvidence.push(`Whale net flow: ${whaleDir} ($${(totalWhaleValue / 1e6).toFixed(1)}M)`);
      }
      if (whalePositions.length > 0) {
        const longCount = whalePositions.filter(p => p.side === 'long').length;
        const shortCount = whalePositions.filter(p => p.side === 'short').length;
        whaleEvidence.push(`${longCount} long / ${shortCount} short positions among top whales`);
      }

      // Dev signal
      const devScore =
        dev.direction === 'building' ? 85 :
        dev.direction === 'stalling' ? 50 : 15;
      const devEvidence: string[] = [
        `${dev.recentPushes} repos pushed in 7 days`,
        `${dev.weeklyDownloads.toLocaleString()} npm downloads/week`,
        `${dev.stars.toLocaleString()} GitHub stars`,
      ];

      // Fear signal (global + asset-specific)
      let fearScore = 50;
      const fearEvidence: string[] = [];
      let fearDir: 'fearful' | 'greedy' | 'neutral' = 'neutral';

      if (fearData) {
        fearEvidence.push(`Fear & Greed: ${fearData.fngValue}/100 (${fearData.fngClassification})`);

        if (fearData.fngValue <= 25) { fearScore = 90; fearDir = 'fearful'; }
        else if (fearData.fngValue <= 40) { fearScore = 70; fearDir = 'fearful'; }
        else if (fearData.fngValue >= 75) { fearScore = 20; fearDir = 'greedy'; }
        else if (fearData.fngValue >= 60) { fearScore = 35; fearDir = 'greedy'; }

        if (asset === 'BTC' && fearData.btcPriceChange24h !== null) {
          fearEvidence.push(`BTC 24h: ${fearData.btcPriceChange24h > 0 ? '+' : ''}${fearData.btcPriceChange24h.toFixed(1)}%`);
          if (fearData.btcPriceChange24h < -5) fearScore = Math.min(95, fearScore + 15);
        }
        if (asset === 'ETH' && fearData.ethPriceChange24h !== null) {
          fearEvidence.push(`ETH 24h: ${fearData.ethPriceChange24h > 0 ? '+' : ''}${fearData.ethPriceChange24h.toFixed(1)}%`);
          if (fearData.ethPriceChange24h < -5) fearScore = Math.min(95, fearScore + 15);
        }
      }

      // ACCUMULATION DIVERGENCE: whales buying + devs building + fear growing
      const isAccumulation = whaleScore >= 65 && devScore >= 65 && fearScore >= 65;
      // DISTRIBUTION DIVERGENCE: whales dumping + devs leaving + greed growing
      const isDistribution = whaleScore <= 35 && devScore <= 35 && fearScore <= 35;

      if (isAccumulation || isDistribution) {
        const convergenceStrength = isAccumulation
          ? Math.round((whaleScore + devScore + fearScore) / 3)
          : Math.round((100 - whaleScore + 100 - devScore + 100 - fearScore) / 3);

        divergences.push({
          asset,
          type: isAccumulation ? 'accumulation_divergence' : 'distribution_divergence',
          whale_signal: { direction: whaleDir === 'accumulating' ? 'accumulating' : whaleDir === 'distributing' ? 'distributing' : 'neutral', evidence: whaleEvidence, score: whaleScore },
          dev_signal: { direction: dev.direction, evidence: devEvidence, score: devScore },
          fear_signal: { direction: fearDir, evidence: fearEvidence, score: fearScore },
          convergence_strength: convergenceStrength,
          verdict: isAccumulation
            ? `${asset}: Whales accumulating while devs are building and the market is fearful. Classic smart money front-run.`
            : `${asset}: Whales distributing while dev activity drops and the market is euphoric. Distribution phase — potential top.`,
        });
      }

      // PARTIAL DIVERGENCES (2 of 3 aligned — still worth flagging)
      const partialAccum = (whaleScore >= 65 && devScore >= 65 && fearScore < 65)
        || (whaleScore >= 65 && fearScore >= 65 && devScore < 65)
        || (devScore >= 65 && fearScore >= 65 && whaleScore < 65);

      if (partialAccum && !isAccumulation) {
        const aligned: string[] = [];
        const missing: string[] = [];
        if (whaleScore >= 65) aligned.push('whales accumulating'); else missing.push('whale confirmation');
        if (devScore >= 65) aligned.push('devs building'); else missing.push('dev momentum');
        if (fearScore >= 65) aligned.push('fear present'); else missing.push('fear signal');

        const convergenceStrength = Math.round((whaleScore + devScore + fearScore) / 3);
        if (convergenceStrength >= 55) {
          divergences.push({
            asset,
            type: 'accumulation_divergence',
            whale_signal: { direction: whaleDir === 'accumulating' ? 'accumulating' : whaleDir === 'distributing' ? 'distributing' : 'neutral', evidence: whaleEvidence, score: whaleScore },
            dev_signal: { direction: dev.direction, evidence: devEvidence, score: devScore },
            fear_signal: { direction: fearDir, evidence: fearEvidence, score: fearScore },
            convergence_strength: convergenceStrength,
            verdict: `${asset}: Partial divergence — ${aligned.join(' + ')}. Missing: ${missing.join(', ')}.`,
          });
        }
      }
    }
  }

  // Sort by convergence strength
  divergences.sort((a, b) => b.convergence_strength - a.convergence_strength);
  return divergences;
}

// ── Telegram Alert ─────────────────────────────────────────────────────

async function sendDivergenceAlert(divergences: AssetDivergence[]): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || divergences.length === 0) return;

  // Filter by cooldown
  const now = Date.now();
  const fresh = divergences.filter(d => {
    const lastTime = lastAlerted.get(d.asset) || 0;
    return (now - lastTime) > COOLDOWN_MS;
  });

  if (fresh.length === 0) return;

  const lines = ['🔍 <b>Divergence Scanner</b>', ''];

  for (const d of fresh.slice(0, 8)) {
    const typeEmoji = d.type === 'accumulation_divergence' ? '🟢' : '🔴';
    const typeLabel = d.type === 'accumulation_divergence' ? 'ACCUMULATION' : 'DISTRIBUTION';

    lines.push(`${typeEmoji} <b>${d.asset}</b> — ${typeLabel} [${d.convergence_strength}/100]`);
    lines.push(`  🐋 Whales: ${d.whale_signal.direction} (${d.whale_signal.score}/100)`);
    if (d.whale_signal.evidence.length > 0) lines.push(`     ${d.whale_signal.evidence[0]}`);
    lines.push(`  👨‍💻 Devs: ${d.dev_signal.direction} (${d.dev_signal.score}/100)`);
    lines.push(`     ${d.dev_signal.evidence[0]}`);
    lines.push(`  😱 Fear: ${d.fear_signal.direction} (${d.fear_signal.score}/100)`);
    if (d.fear_signal.evidence.length > 0) lines.push(`     ${d.fear_signal.evidence[0]}`);
    lines.push(`  → ${d.verdict}`);
    lines.push('');

    lastAlerted.set(d.asset, now);
  }

  const message = lines.join('\n');

  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: ANDREW_CHAT_ID,
        text: message,
        parse_mode: 'HTML',
      }),
    });
    const result = await res.json() as { ok: boolean };
    if (!result.ok) logger.warn({ result }, 'Divergence alert send failed');
  } catch (err) {
    logger.error({ err }, 'Divergence alert error');
  }
}

// ── Main Scanner ───────────────────────────────────────────────────────

export async function runDivergenceScan(): Promise<AssetDivergence[]> {
  logger.info('Running divergence scan...');
  const start = Date.now();

  const [whaleData, devActivity, fearData] = await Promise.all([
    getWhalePositions(),
    getDevActivity(),
    getFearSignals(),
  ]);

  const divergences = detectDivergences(whaleData, devActivity, fearData);

  // Log all scans
  appendJsonl(DIVERGENCE_LOG, {
    timestamp: new Date().toISOString(),
    scan_latency_ms: Date.now() - start,
    divergences_found: divergences.length,
    assets_scanned: devActivity.reduce((s, d) => s + d.assets.length, 0),
    whale_data_available: !!whaleData,
    fear_greed: fearData?.fngValue ?? null,
    divergences: divergences.map(d => ({
      asset: d.asset,
      type: d.type,
      strength: d.convergence_strength,
    })),
  });

  // Send alert if any divergences found
  await sendDivergenceAlert(divergences);

  logger.info({ divergences: divergences.length, latency: Date.now() - start }, 'Divergence scan complete');
  return divergences;
}

// ── Background Runner ──────────────────────────────────────────────────

let scanInterval: ReturnType<typeof setInterval> | null = null;

export function startDivergenceScanner(): void {
  logger.info(`Starting divergence scanner (${SCAN_INTERVAL_MS / 60000}-min interval)`);

  // First scan after 2 minutes (let other services stabilize)
  setTimeout(() => { void runDivergenceScan(); }, 2 * 60 * 1000);

  scanInterval = setInterval(() => { void runDivergenceScan(); }, SCAN_INTERVAL_MS);
}

export function stopDivergenceScanner(): void {
  if (scanInterval) {
    clearInterval(scanInterval);
    scanInterval = null;
  }
}

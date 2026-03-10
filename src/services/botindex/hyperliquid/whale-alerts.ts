import logger from '../../../config/logger';

const HL_API = 'https://api.hyperliquid.xyz/info';

// Known whale addresses (top traders from Hyperliquid leaderboard)
// These are public addresses visible on the Hyperliquid explorer
// Updated: 2026-03-10 - Top traders by 30D PnL with active positions
const WHALE_ADDRESSES = [
  '0xa5b0edf6b55128e0ddae8e51ac538c3188401d41', // $42M account, $187M BTC+ETH longs (the $194M whale from recon)
  '0x393d0b87ed38fc779fd9611144ae649ba6082109', // #1 30D PnL: +$53M (currently flat/sub-account)
  '0x488d2a9b70cc18ef66057a48ab3d59da1c59fe08', // #2 30D PnL: +$9.8M (currently flat/sub-account)
  '0x0c5e5e6554b54d1445c3247ce620c400b8033dd4', // #3 30D PnL: +$8.4M (currently flat/sub-account)
  '0x179f3d11483dafe616d56b32c4ce2562faabbbbb', // #5 30D PnL: +$7.6M (currently flat/sub-account)
  '0xe44bd27c9f10fa2f89fdb3ab4b4f0e460da29ea8', // #6 30D PnL: +$6.9M (currently flat/sub-account)
  '0x87f9cd15f5050a9283b8896300f7c8cf69ece2cf', // #7 30D PnL: +$6.2M (currently flat/sub-account)
  '0x90b38c5728f184c87ef46479cf7b402d7b98b98a', // #8 30D PnL: +$6.0M (currently flat/sub-account)
  '0x05cafe987297448f21a3c7ae0ae815fddecac655', // #9 30D PnL: +$5.9M (currently flat/sub-account)
  '0x85530f0ff6496c72a619f37a60f3c1a59077737f', // #10 30D PnL: +$5.9M (currently flat/sub-account)
];

interface WhalePosition {
  address: string;
  coin: string;
  szi: string; // signed position size
  entryPx: string;
  positionValue: number;
  unrealizedPnl: number;
  leverage: number;
  liquidationPx: string | null;
  side: 'LONG' | 'SHORT';
  marginUsed: string;
  returnOnEquity: number;
}

interface WhaleTrade {
  address: string;
  coin: string;
  px: string;
  sz: string;
  side: 'B' | 'A'; // B=Buy, A=Ask/Sell
  time: number;
  dir: string;
  closedPnl: string;
  hash: string;
  usdValue: number;
}

interface WhaleAlertResult {
  topPositions: WhalePosition[];
  recentLargeTrades: WhaleTrade[];
  totalTrackedValue: number;
  whalesTracked: number;
  timestamp: string;
}

// In-memory cache
let cache: { data: WhaleAlertResult | null; expiry: number } = {
  data: null,
  expiry: 0,
};
const CACHE_TTL_MS = 60_000; // 1 minute

async function hlPost(body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(HL_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HL API ${res.status}: ${res.statusText}`);
  return res.json();
}

async function getWhalePositions(address: string): Promise<WhalePosition[]> {
  try {
    const data = (await hlPost({ type: 'clearinghouseState', user: address })) as any;
    if (!data?.assetPositions) return [];
    return data.assetPositions
      .filter((ap: any) => ap.position && parseFloat(ap.position.szi) !== 0)
      .map((ap: any) => {
        const pos = ap.position;
        const szi = parseFloat(pos.szi);
        const entryPx = parseFloat(pos.entryPx);
        const positionValue = Math.abs(szi) * entryPx;
        const unrealizedPnl = parseFloat(pos.unrealizedPnl);
        const marginUsed = parseFloat(pos.marginUsed);
        const leverage = marginUsed > 0 ? positionValue / marginUsed : 0;
        return {
          address,
          coin: pos.coin,
          szi: pos.szi,
          entryPx: pos.entryPx,
          positionValue,
          unrealizedPnl,
          leverage: Math.round(leverage * 10) / 10,
          liquidationPx: pos.liquidationPx || null,
          side: szi > 0 ? 'LONG' : 'SHORT',
          marginUsed: pos.marginUsed,
          returnOnEquity: marginUsed > 0 ? (unrealizedPnl / marginUsed) * 100 : 0,
        } as WhalePosition;
      })
      .filter((p: WhalePosition) => p.positionValue >= 50_000); // Only positions >= $50K
  } catch (err) {
    logger.warn({ err, address }, 'Failed to fetch positions for whale');
    return [];
  }
}

async function getWhaleFills(address: string): Promise<WhaleTrade[]> {
  try {
    const fills = (await hlPost({ type: 'userFills', user: address })) as any[];
    if (!Array.isArray(fills)) return [];
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    return fills
      .filter((f: any) => f.time >= oneDayAgo)
      .map((f: any) => ({
        address,
        coin: f.coin,
        px: f.px,
        sz: f.sz,
        side: f.side,
        time: f.time,
        dir: f.dir,
        closedPnl: f.closedPnl,
        hash: f.hash,
        usdValue: parseFloat(f.px) * parseFloat(f.sz),
      }))
      .filter((t: WhaleTrade) => t.usdValue >= 10_000); // Only trades >= $10K
  } catch (err) {
    logger.warn({ err, address }, 'Failed to fetch fills for whale');
    return [];
  }
}

// Dynamically discover top traders from the leaderboard
async function discoverWhaleAddresses(): Promise<string[]> {
  try {
    // Use the clearinghouse endpoint to get top positions
    // We can also hardcode known addresses and supplement with leaderboard
    const knownWhales = [...WHALE_ADDRESSES];
    // Try to get leaderboard data
    try {
      const leaderboard = (await hlPost({ type: 'leaderboard', period: '1d' })) as any;
      if (Array.isArray(leaderboard)) {
        const topAddresses = leaderboard
          .slice(0, 20)
          .map((entry: any) => entry.ethAddress || entry.address)
          .filter(Boolean);
        knownWhales.push(...topAddresses);
      }
    } catch {
      // Leaderboard endpoint may not exist or may have different format
    }
    // Deduplicate
    return [...new Set(knownWhales.map((a) => a.toLowerCase()))];
  } catch {
    return WHALE_ADDRESSES;
  }
}

export async function getHyperliquidWhaleAlerts(): Promise<WhaleAlertResult> {
  const now = Date.now();
  if (cache.data && now < cache.expiry) return cache.data;

  const addresses = await discoverWhaleAddresses();

  // Fetch positions and fills in parallel for all whales
  const [positionsArrays, tradesArrays] = await Promise.all([
    Promise.all(addresses.map(getWhalePositions)),
    Promise.all(addresses.map(getWhaleFills)),
  ]);

  const allPositions = positionsArrays.flat();
  const allTrades = tradesArrays.flat();

  // Sort positions by value desc
  allPositions.sort((a, b) => b.positionValue - a.positionValue);

  // Sort trades by time desc
  allTrades.sort((a, b) => b.time - a.time);

  const totalTrackedValue = allPositions.reduce((sum, p) => sum + p.positionValue, 0);
  const result: WhaleAlertResult = {
    topPositions: allPositions.slice(0, 50),
    recentLargeTrades: allTrades.slice(0, 50),
    totalTrackedValue: Math.round(totalTrackedValue),
    whalesTracked: addresses.length,
    timestamp: new Date().toISOString(),
  };
  cache = { data: result, expiry: now + CACHE_TTL_MS };
  return result;
}

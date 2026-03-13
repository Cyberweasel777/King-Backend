import logger from '../../../config/logger';

export interface StablecoinFlow {
  token: 'USDC' | 'USDT';
  chain: 'ethereum' | 'base';
  from: string;
  to: string;
  amountUsd: number;
  txHash: string;
  blockNumber: number;
  timestamp: string;
  flowType: 'whale_transfer' | 'bridge' | 'exchange_deposit' | 'exchange_withdrawal' | 'unknown';
  fromLabel?: string;
  toLabel?: string;
}

export type StablecoinSource = 'etherscan' | 'basescan' | 'base_rpc';
export type StablecoinSourceStatus = 'ok' | 'error' | 'skipped';

export interface StablecoinFlowScanResult {
  flows: StablecoinFlow[];
  fetchedAt: string;
  cached: boolean;
  sources: Record<StablecoinSource, StablecoinSourceStatus>;
}

interface ScanTransferRow {
  blockNumber?: string;
  timeStamp?: string;
  hash?: string;
  from?: string;
  to?: string;
  value?: string;
  tokenDecimal?: string;
  tokenSymbol?: string;
}

interface ScanApiResponse {
  status?: string;
  message?: string;
  result?: unknown;
}

interface RpcLog {
  address?: string;
  blockNumber?: string;
  transactionHash?: string;
  data?: string;
  topics?: string[];
}

interface StablecoinSummaryCounter {
  address: string;
  label?: string;
  count: number;
  totalUsd: number;
}

export interface StablecoinFlowSummary {
  totalVolumeUsd: number;
  transferCount: number;
  topSenders: StablecoinSummaryCounter[];
  topReceivers: StablecoinSummaryCounter[];
  flowBreakdown: Record<StablecoinFlow['flowType'], { count: number; volumeUsd: number }>;
  bridgeVsExchangeRatio: number | null;
}

const CACHE_TTL_MS = 3 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 12000;
const MIN_USD_DEFAULT = 50_000;
const DAY_MS = 24 * 60 * 60 * 1000;

const ETHERSCAN_BASE_URL = 'https://api.etherscan.io/api';
const BASESCAN_BASE_URL = 'https://api.basescan.org/api';
const BASE_RPC_URL = 'https://mainnet.base.org';

const ETH_USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const ETH_USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const KNOWN_ADDRESS_LABELS: Record<string, string> = {
  // Coinbase
  '0x503828976d22510aad0201ac7ec88293211d23da': 'Coinbase',
  '0x3cd751e6b0078be393132286c442345e5dc49699': 'Coinbase',
  '0xb739d0895772dbb71a89a3754a160269068f0d45': 'Coinbase',

  // Binance
  '0x28c6c06298d514db089934071355e5743bf21d60': 'Binance',

  // Circle
  '0x55fe002aeff02f77364de339a1292923a15844b8': 'Circle',
};

let flowCache: { data: StablecoinFlowScanResult; expiresAt: number } | null = null;

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function round(value: number, decimals: number = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function normalizeAddress(value: string): string {
  return value.toLowerCase();
}

function getAddressLabel(address: string): string | undefined {
  return KNOWN_ADDRESS_LABELS[normalizeAddress(address)];
}

function isExchangeLabel(label?: string): boolean {
  return label === 'Coinbase' || label === 'Binance';
}

function classifyFlowType(fromLabel: string | undefined, toLabel: string | undefined, amountUsd: number): StablecoinFlow['flowType'] {
  if (fromLabel === 'Circle' || toLabel === 'Circle') {
    return 'bridge';
  }

  const fromExchange = isExchangeLabel(fromLabel);
  const toExchange = isExchangeLabel(toLabel);

  if (!fromExchange && toExchange) {
    return 'exchange_deposit';
  }

  if (fromExchange && !toExchange) {
    return 'exchange_withdrawal';
  }

  if (amountUsd >= MIN_USD_DEFAULT) {
    return 'whale_transfer';
  }

  return 'unknown';
}

function parseAmount(value: string, decimals: number): number {
  if (!value || decimals < 0) return 0;

  let big: bigint;
  try {
    big = BigInt(value);
  } catch {
    return 0;
  }

  const negative = big < 0n;
  const abs = negative ? -big : big;
  const s = abs.toString().padStart(decimals + 1, '0');

  const whole = decimals > 0 ? s.slice(0, -decimals) : s;
  const frac = decimals > 0 ? s.slice(-decimals).replace(/0+$/, '') : '';
  const combined = `${negative ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`;

  return toNumber(combined);
}

function asRecentIso(timestampSec: string | undefined): string {
  const seconds = Number.parseInt(String(timestampSec || ''), 10);
  if (Number.isFinite(seconds) && seconds > 0) {
    return new Date(seconds * 1000).toISOString();
  }
  return new Date().toISOString();
}

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'king-backend/1.0',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json() as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchScanTransfers(baseUrl: string, contractAddress: string, apiKey: string, offset: number = 100): Promise<ScanTransferRow[]> {
  const url = new URL(baseUrl);
  url.searchParams.set('module', 'account');
  url.searchParams.set('action', 'tokentx');
  url.searchParams.set('contractaddress', contractAddress);
  url.searchParams.set('sort', 'desc');
  url.searchParams.set('page', '1');
  url.searchParams.set('offset', String(offset));
  if (apiKey) {
    url.searchParams.set('apikey', apiKey);
  }

  const payload = await fetchJson<ScanApiResponse>(url.toString());
  if (!Array.isArray(payload.result)) {
    if (payload.status === '0' && String(payload.message || '').toLowerCase().includes('no transactions')) {
      return [];
    }
    throw new Error(`Unexpected explorer payload: ${payload.message || 'missing result array'}`);
  }

  return payload.result.filter((row): row is ScanTransferRow => typeof row === 'object' && row !== null);
}

function mapScanRowToFlow(row: ScanTransferRow, chain: StablecoinFlow['chain'], token: StablecoinFlow['token']): StablecoinFlow | null {
  const from = String(row.from || '').toLowerCase();
  const to = String(row.to || '').toLowerCase();
  const txHash = String(row.hash || '');

  if (!from || !to || !txHash) return null;

  const decimals = Number.parseInt(String(row.tokenDecimal || '6'), 10);
  const amountUsd = parseAmount(String(row.value || '0'), Number.isFinite(decimals) ? decimals : 6);
  if (amountUsd <= 0) return null;

  const blockNumber = Number.parseInt(String(row.blockNumber || '0'), 10);
  const fromLabel = getAddressLabel(from);
  const toLabel = getAddressLabel(to);

  return {
    token,
    chain,
    from,
    to,
    amountUsd: round(amountUsd, 2),
    txHash,
    blockNumber: Number.isFinite(blockNumber) ? blockNumber : 0,
    timestamp: asRecentIso(row.timeStamp),
    flowType: classifyFlowType(fromLabel, toLabel, amountUsd),
    fromLabel,
    toLabel,
  };
}

async function fetchEthereumScanFlows(etherscanApiKey: string): Promise<StablecoinFlow[]> {
  const [usdcRows, usdtRows] = await Promise.all([
    fetchScanTransfers(ETHERSCAN_BASE_URL, ETH_USDC, etherscanApiKey, 120),
    fetchScanTransfers(ETHERSCAN_BASE_URL, ETH_USDT, etherscanApiKey, 120),
  ]);

  const flows: StablecoinFlow[] = [];
  for (const row of usdcRows) {
    const flow = mapScanRowToFlow(row, 'ethereum', 'USDC');
    if (flow) flows.push(flow);
  }
  for (const row of usdtRows) {
    const flow = mapScanRowToFlow(row, 'ethereum', 'USDT');
    if (flow) flows.push(flow);
  }

  return flows;
}

async function fetchBaseScanFlows(basescanApiKey: string): Promise<StablecoinFlow[]> {
  const rows = await fetchScanTransfers(BASESCAN_BASE_URL, BASE_USDC, basescanApiKey, 120);
  const flows: StablecoinFlow[] = [];

  for (const row of rows) {
    const flow = mapScanRowToFlow(row, 'base', 'USDC');
    if (flow) flows.push(flow);
  }

  return flows;
}

async function callBaseRpc(method: string, params: unknown[]): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(BASE_RPC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method,
        params,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json() as { error?: { message?: string }; result?: unknown };
    if (payload.error) {
      throw new Error(payload.error.message || 'RPC error');
    }

    return payload.result;
  } finally {
    clearTimeout(timeout);
  }
}

function parseAddressFromTopic(topic: string | undefined): string {
  if (!topic || !topic.startsWith('0x')) return '';
  const hex = topic.slice(2).padStart(64, '0');
  const addressHex = hex.slice(24);
  return `0x${addressHex}`.toLowerCase();
}

async function fetchBaseRpcFlows(): Promise<StablecoinFlow[]> {
  // Without scan API keys, use Base public RPC over recent blocks.
  const latestHex = await callBaseRpc('eth_blockNumber', []);
  if (typeof latestHex !== 'string') {
    throw new Error('Invalid eth_blockNumber response');
  }

  const latest = Number.parseInt(latestHex, 16);
  if (!Number.isFinite(latest) || latest <= 0) {
    throw new Error('Failed to parse latest block number');
  }

  // ~8-9 hours on Base. Full 24h via eth_getLogs is often too large for public RPC limits.
  const fromBlock = Math.max(0, latest - 16_000);

  const logsResult = await callBaseRpc('eth_getLogs', [{
    fromBlock: `0x${fromBlock.toString(16)}`,
    toBlock: `0x${latest.toString(16)}`,
    address: BASE_USDC,
    topics: [TRANSFER_TOPIC],
  }]);

  const logs = Array.isArray(logsResult)
    ? logsResult.filter((entry): entry is RpcLog => typeof entry === 'object' && entry !== null)
    : [];

  const blockTsCache = new Map<string, string>();
  const flows: StablecoinFlow[] = [];

  for (const logEntry of logs.slice(-500)) {
    const topics = Array.isArray(logEntry.topics) ? logEntry.topics : [];
    const from = parseAddressFromTopic(topics[1]);
    const to = parseAddressFromTopic(topics[2]);
    const txHash = String(logEntry.transactionHash || '');
    const blockHex = String(logEntry.blockNumber || '0x0');

    if (!from || !to || !txHash || !blockHex) continue;

    const rawValue = String(logEntry.data || '0x0');
    const value = rawValue.startsWith('0x') ? BigInt(rawValue) : 0n;
    const amountUsd = parseAmount(value.toString(), 6);
    if (amountUsd <= 0) continue;

    let timestamp = blockTsCache.get(blockHex);
    if (!timestamp) {
      const block = await callBaseRpc('eth_getBlockByNumber', [blockHex, false]);
      const blockObj = (block && typeof block === 'object') ? block as Record<string, unknown> : null;
      const tsHex = String(blockObj?.timestamp || '0x0');
      const ts = Number.parseInt(tsHex, 16);
      timestamp = Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000).toISOString() : new Date().toISOString();
      blockTsCache.set(blockHex, timestamp);
    }

    const blockNumber = Number.parseInt(blockHex, 16);
    const fromLabel = getAddressLabel(from);
    const toLabel = getAddressLabel(to);

    flows.push({
      token: 'USDC',
      chain: 'base',
      from,
      to,
      amountUsd: round(amountUsd, 2),
      txHash,
      blockNumber: Number.isFinite(blockNumber) ? blockNumber : 0,
      timestamp,
      flowType: classifyFlowType(fromLabel, toLabel, amountUsd),
      fromLabel,
      toLabel,
    });
  }

  return flows;
}

function dedupeFlows(flows: StablecoinFlow[]): StablecoinFlow[] {
  const seen = new Set<string>();
  const out: StablecoinFlow[] = [];

  for (const flow of flows) {
    const key = `${flow.chain}:${flow.token}:${flow.txHash}:${flow.from}:${flow.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(flow);
  }

  return out;
}

export async function scanStablecoinFlows(): Promise<StablecoinFlowScanResult> {
  const now = Date.now();
  if (flowCache && flowCache.expiresAt > now) {
    return {
      ...flowCache.data,
      cached: true,
    };
  }

  const etherscanApiKey = process.env.ETHERSCAN_API_KEY || '';
  const basescanApiKey = process.env.BASESCAN_API_KEY || '';

  const sourceStatuses: Record<StablecoinSource, StablecoinSourceStatus> = {
    etherscan: 'skipped',
    basescan: 'skipped',
    base_rpc: 'skipped',
  };

  const jobs: Array<{ source: StablecoinSource; promise: Promise<StablecoinFlow[]> }> = [];

  if (etherscanApiKey) {
    jobs.push({ source: 'etherscan', promise: fetchEthereumScanFlows(etherscanApiKey) });
  }

  if (basescanApiKey) {
    jobs.push({ source: 'basescan', promise: fetchBaseScanFlows(basescanApiKey) });
  } else {
    jobs.push({ source: 'base_rpc', promise: fetchBaseRpcFlows() });
  }

  const settled = await Promise.allSettled(jobs.map((job) => job.promise));

  const allFlows: StablecoinFlow[] = [];
  for (let i = 0; i < jobs.length; i += 1) {
    const job = jobs[i];
    const result = settled[i];

    if (!job || !result) continue;

    if (result.status === 'fulfilled') {
      sourceStatuses[job.source] = 'ok';
      allFlows.push(...result.value);
    } else {
      sourceStatuses[job.source] = 'error';
      logger.warn({ err: result.reason, source: job.source }, '[stablecoin.flows] source failed');
    }
  }

  const cutoff = Date.now() - DAY_MS;
  const filtered = dedupeFlows(allFlows)
    .filter((flow) => flow.amountUsd >= MIN_USD_DEFAULT)
    .filter((flow) => {
      const ts = Date.parse(flow.timestamp);
      return Number.isFinite(ts) && ts >= cutoff;
    })
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

  const response: StablecoinFlowScanResult = {
    flows: filtered,
    fetchedAt: new Date().toISOString(),
    cached: false,
    sources: sourceStatuses,
  };

  flowCache = {
    data: response,
    expiresAt: now + CACHE_TTL_MS,
  };

  return response;
}

function rankAddresses(items: StablecoinFlow[], side: 'from' | 'to', limit: number): StablecoinSummaryCounter[] {
  const map = new Map<string, StablecoinSummaryCounter>();

  for (const item of items) {
    const address = item[side];
    const label = side === 'from' ? item.fromLabel : item.toLabel;

    const existing = map.get(address);
    if (existing) {
      existing.count += 1;
      existing.totalUsd = round(existing.totalUsd + item.amountUsd, 2);
    } else {
      map.set(address, {
        address,
        label,
        count: 1,
        totalUsd: round(item.amountUsd, 2),
      });
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.totalUsd - a.totalUsd)
    .slice(0, Math.max(1, limit));
}

export function summarizeStablecoinFlows(flows: StablecoinFlow[], topN: number = 5): StablecoinFlowSummary {
  const breakdown: StablecoinFlowSummary['flowBreakdown'] = {
    whale_transfer: { count: 0, volumeUsd: 0 },
    bridge: { count: 0, volumeUsd: 0 },
    exchange_deposit: { count: 0, volumeUsd: 0 },
    exchange_withdrawal: { count: 0, volumeUsd: 0 },
    unknown: { count: 0, volumeUsd: 0 },
  };

  let totalVolumeUsd = 0;

  for (const flow of flows) {
    totalVolumeUsd += flow.amountUsd;
    breakdown[flow.flowType].count += 1;
    breakdown[flow.flowType].volumeUsd = round(breakdown[flow.flowType].volumeUsd + flow.amountUsd, 2);
  }

  const exchangeVolume = breakdown.exchange_deposit.volumeUsd + breakdown.exchange_withdrawal.volumeUsd;
  const bridgeVolume = breakdown.bridge.volumeUsd;

  return {
    totalVolumeUsd: round(totalVolumeUsd, 2),
    transferCount: flows.length,
    topSenders: rankAddresses(flows, 'from', topN),
    topReceivers: rankAddresses(flows, 'to', topN),
    flowBreakdown: breakdown,
    bridgeVsExchangeRatio: exchangeVolume > 0 ? round(bridgeVolume / exchangeVolume, 4) : null,
  };
}

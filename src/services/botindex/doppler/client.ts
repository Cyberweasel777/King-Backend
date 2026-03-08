import { GraphQLClient, gql } from 'graphql-request';
import logger from '../../../config/logger';

const DEFAULT_DOPPLER_INDEXER_URL = 'https://testnet-indexer.doppler.lol/graphql';
const DEFAULT_BASE_RPC_URL = 'https://mainnet.base.org';
const DEFAULT_CACHE_TTL_MS = 2 * 60 * 1000;
const BASE_CHAIN_ID = 8453;
const FALLBACK_LOOKBACK_BLOCKS = 45_000;
const MAX_QUERY_LIMIT = 250;

type DataSource = 'indexer' | 'rpc';
type Address = `0x${string}`;

type CachedValue<T> = {
  value: T;
  expiresAt: number;
};

interface ViemPublicClient {
  getBlockNumber: () => Promise<bigint>;
  getLogs: (args: {
    address: Address;
    event: unknown;
    fromBlock: bigint;
    toBlock: bigint;
  }) => Promise<Array<{ blockNumber?: bigint | null }>>;
  getBlock: (args: { blockNumber: bigint }) => Promise<{ timestamp: bigint }>;
  getBytecode: (args: { address: Address }) => Promise<`0x${string}` | undefined>;
  readContract: (args: {
    address: Address;
    abi: unknown;
    functionName: 'name' | 'symbol' | 'decimals';
  }) => Promise<unknown>;
}

interface ViemRuntime {
  createPublicClient: (args: { chain: unknown; transport: unknown }) => ViemPublicClient;
  http: (url: string) => unknown;
  isAddress: (value: string) => boolean;
  parseAbi: (definitions: readonly string[]) => unknown;
  parseAbiItem: (definition: string) => unknown;
  baseChain: unknown;
}

let viemRuntimeCache: ViemRuntime | null = null;

function loadViemRuntime(): ViemRuntime {
  if (viemRuntimeCache) {
    return viemRuntimeCache;
  }

  const viemModule = require('viem') as Record<string, unknown>;
  const chainModule = require('viem/chains') as Record<string, unknown>;

  const createPublicClient = viemModule.createPublicClient;
  const http = viemModule.http;
  const isAddress = viemModule.isAddress;
  const parseAbi = viemModule.parseAbi;
  const parseAbiItem = viemModule.parseAbiItem;
  const baseChain = chainModule.base;

  if (
    typeof createPublicClient !== 'function' ||
    typeof http !== 'function' ||
    typeof isAddress !== 'function' ||
    typeof parseAbi !== 'function' ||
    typeof parseAbiItem !== 'function' ||
    !baseChain
  ) {
    throw new Error('Viem runtime exports are unavailable');
  }

  viemRuntimeCache = {
    createPublicClient: createPublicClient as ViemRuntime['createPublicClient'],
    http: http as ViemRuntime['http'],
    isAddress: isAddress as ViemRuntime['isAddress'],
    parseAbi: parseAbi as ViemRuntime['parseAbi'],
    parseAbiItem: parseAbiItem as ViemRuntime['parseAbiItem'],
    baseChain,
  };

  return viemRuntimeCache;
}

interface GraphqlAssetRow {
  address?: string;
  chainId?: number | string;
  marketCapUsd?: number | string;
  dayVolumeUsd?: number | string;
  liquidityUsd?: number | string;
  createdAt?: string | number;
  integrator?: string | null;
  numTokensToSell?: number | string;
  migrated?: boolean;
  percentDayChange?: number | string;
}

interface GraphqlTokenRow {
  address?: string;
  chainId?: number | string;
  name?: string | null;
  symbol?: string | null;
  decimals?: number | string;
  holderCount?: number | string;
  volumeUsd?: number | string;
  creatorAddress?: string | null;
  image?: string | null;
  isDerc20?: boolean;
}

interface GraphqlAssetsResponse {
  assets?: {
    items?: GraphqlAssetRow[];
  };
}

interface GraphqlTokensResponse {
  tokens?: {
    items?: GraphqlTokenRow[];
  };
}

export interface DopplerAsset {
  address: string;
  chainId: number;
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  marketCapUsd: number;
  dayVolumeUsd: number;
  liquidityUsd: number;
  createdAt: string;
  ageHours: number;
  volumeVelocity: number;
  holderCount: number;
  integrator: string | null;
  creatorAddress: string | null;
  creatorLaunchCount: number;
  numTokensToSell: number | null;
  migrated: boolean;
  percentDayChange: number | null;
  image: string | null;
  isDerc20: boolean | null;
  sniperProtectionEnabled: boolean;
  source: DataSource;
}

const RECENT_ASSETS_QUERY = gql`
  query DopplerRecentAssets($limit: Int!) {
    assets(where: { chainId: 8453 }, limit: $limit, orderBy: "createdAt", orderDirection: "desc") {
      items {
        address
        chainId
        marketCapUsd
        dayVolumeUsd
        liquidityUsd
        createdAt
        integrator
        numTokensToSell
        migrated
        percentDayChange
      }
    }
  }
`;

const DEFAULT_ASSETS_QUERY = gql`
  query DopplerAssets($limit: Int!) {
    assets(where: { chainId: 8453 }, limit: $limit, orderBy: "marketCapUsd", orderDirection: "desc") {
      items {
        address
        chainId
        marketCapUsd
        dayVolumeUsd
        liquidityUsd
        createdAt
        integrator
        numTokensToSell
        migrated
        percentDayChange
      }
    }
  }
`;

const TOKENS_QUERY = gql`
  query DopplerTokens($limit: Int!) {
    tokens(limit: $limit) {
      items {
        address
        chainId
        name
        symbol
        decimals
        holderCount
        volumeUsd
        creatorAddress
        image
        isDerc20
      }
    }
  }
`;

const ASSET_DETAILS_QUERY = gql`
  query DopplerAssetDetails($address: String!) {
    assets(where: { chainId: 8453, address: $address }, limit: 1) {
      items {
        address
        chainId
        marketCapUsd
        dayVolumeUsd
        liquidityUsd
        createdAt
        integrator
        numTokensToSell
        migrated
        percentDayChange
      }
    }
  }
`;

const TOKEN_DETAILS_QUERY = gql`
  query DopplerTokenDetails($address: String!) {
    tokens(where: { chainId: 8453, address: $address }, limit: 1) {
      items {
        address
        chainId
        name
        symbol
        decimals
        holderCount
        volumeUsd
        creatorAddress
        image
        isDerc20
      }
    }
  }
`;

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = toNumber(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNullableString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  return fallback;
}

function normalizeTimestamp(value: unknown): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) {
      const asNumber = Number.parseInt(trimmed, 10);
      if (Number.isFinite(asNumber) && asNumber > 0) {
        const ms = asNumber > 10_000_000_000 ? asNumber : asNumber * 1000;
        return new Date(ms).toISOString();
      }
    }

    const parsedMs = Date.parse(trimmed);
    if (Number.isFinite(parsedMs)) {
      return new Date(parsedMs).toISOString();
    }
  }

  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    const ms = value > 10_000_000_000 ? value : value * 1000;
    return new Date(ms).toISOString();
  }

  return new Date().toISOString();
}

function ageHoursFromIso(iso: string): number {
  const parsedMs = Date.parse(iso);
  if (!Number.isFinite(parsedMs)) return 0;
  return Math.max(0, (Date.now() - parsedMs) / (1000 * 60 * 60));
}

function normalizeAddressLower(address: string): string {
  return address.trim().toLowerCase();
}

function clampLimit(limit: number, fallback: number): number {
  if (!Number.isFinite(limit) || limit < 1) return fallback;
  return Math.min(Math.floor(limit), MAX_QUERY_LIMIT);
}

function uniqueAddresses(addresses: string[]): string[] {
  return Array.from(new Set(addresses.map((address) => normalizeAddressLower(address))));
}

export class DopplerClient {
  private readonly indexerClient: GraphQLClient;
  private readonly viem: ViemRuntime;
  private readonly publicClient: ViemPublicClient;
  private readonly erc20Abi: unknown;
  private readonly transferEvent: unknown;
  private readonly cache = new Map<string, CachedValue<unknown>>();
  private readonly knownAssets = new Map<string, DopplerAsset>();
  private readonly cacheTtlMs: number;

  constructor() {
    this.indexerClient = new GraphQLClient(process.env.DOPPLER_INDEXER_URL || DEFAULT_DOPPLER_INDEXER_URL);
    this.cacheTtlMs = toNumber(process.env.DOPPLER_CACHE_TTL_MS, DEFAULT_CACHE_TTL_MS);
    this.viem = loadViemRuntime();
    this.publicClient = this.viem.createPublicClient({
      chain: this.viem.baseChain,
      transport: this.viem.http(process.env.BASE_RPC_URL || DEFAULT_BASE_RPC_URL),
    });
    this.erc20Abi = this.viem.parseAbi([
      'function name() view returns (string)',
      'function symbol() view returns (string)',
      'function decimals() view returns (uint8)',
    ]);
    this.transferEvent = this.viem.parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');
  }

  async getRecentLaunches(hours: number, limit: number): Promise<DopplerAsset[]> {
    const safeHours = Number.isFinite(hours) && hours > 0 ? Math.min(hours, 7 * 24) : 24;
    const safeLimit = clampLimit(limit, 20);
    const cacheKey = `doppler:recent:${safeHours}:${safeLimit}`;
    const cached = this.getFromCache<DopplerAsset[]>(cacheKey);

    if (cached) {
      return cached;
    }

    try {
      const sample = await this.fetchIndexerAssets(Math.max(safeLimit * 6, 80));
      const cutoffMs = Date.now() - safeHours * 60 * 60 * 1000;
      const recent = sample
        .filter((asset) => Date.parse(asset.createdAt) >= cutoffMs)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .slice(0, safeLimit);

      this.rememberAssets(sample);
      this.setCache(cacheKey, recent);
      return recent;
    } catch (error) {
      logger.warn({ err: error }, 'Doppler indexer recent launches query failed, falling back to Base RPC');
      const fallback = await this.getRecentLaunchesFromRpc(safeHours, safeLimit);
      this.setCache(cacheKey, fallback);
      return fallback;
    }
  }

  async getAssetDetails(address: string): Promise<DopplerAsset> {
    const normalizedAddress = normalizeAddressLower(address);
    if (!this.viem.isAddress(normalizedAddress)) {
      throw new Error('Invalid token address');
    }

    const cacheKey = `doppler:asset:${normalizedAddress}`;
    const cached = this.getFromCache<DopplerAsset>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const fromIndexer = await this.fetchIndexerAssetDetails(normalizedAddress);
      if (fromIndexer) {
        this.rememberAssets([fromIndexer]);
        this.setCache(cacheKey, fromIndexer);
        return fromIndexer;
      }
    } catch (error) {
      logger.warn({ err: error, address: normalizedAddress }, 'Doppler indexer asset details query failed, using Base RPC fallback');
    }

    const fallbackSeed = this.knownAssets.get(normalizedAddress);
    const fromRpc = await this.fetchAssetFromRpc(normalizedAddress as Address, fallbackSeed);
    this.rememberAssets([fromRpc]);
    this.setCache(cacheKey, fromRpc);
    return fromRpc;
  }

  async getTrendingAssets(limit: number): Promise<DopplerAsset[]> {
    const safeLimit = clampLimit(limit, 10);
    const cacheKey = `doppler:trending:${safeLimit}`;
    const cached = this.getFromCache<DopplerAsset[]>(cacheKey);

    if (cached) {
      return cached;
    }

    try {
      const sample = await this.fetchIndexerAssets(Math.max(safeLimit * 8, 100));
      const trending = sample
        .sort((a, b) => b.volumeVelocity - a.volumeVelocity)
        .slice(0, safeLimit);

      this.rememberAssets(sample);
      this.setCache(cacheKey, trending);
      return trending;
    } catch (error) {
      logger.warn({ err: error }, 'Doppler indexer trending query failed, falling back to Base RPC');
      const fallback = await this.getTrendingFromRpc(safeLimit);
      this.setCache(cacheKey, fallback);
      return fallback;
    }
  }

  private getFromCache<T>(key: string): T | null {
    const hit = this.cache.get(key);
    if (!hit) return null;

    if (hit.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return null;
    }

    return hit.value as T;
  }

  private setCache<T>(key: string, value: T): void {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.cacheTtlMs,
    });
  }

  private rememberAssets(assets: DopplerAsset[]): void {
    for (const asset of assets) {
      this.knownAssets.set(normalizeAddressLower(asset.address), asset);
    }
  }

  private mapAssetRow(assetRow: GraphqlAssetRow, tokenRow: GraphqlTokenRow | null, source: DataSource): DopplerAsset | null {
    const address = toNullableString(assetRow.address) || toNullableString(tokenRow?.address);
    if (!address || !this.viem.isAddress(address)) {
      return null;
    }

    const chainId = Math.trunc(toNumber(assetRow.chainId ?? tokenRow?.chainId, BASE_CHAIN_ID));
    const marketCapUsd = Math.max(0, toNumber(assetRow.marketCapUsd));
    const dayVolumeUsd = Math.max(0, toNumber(assetRow.dayVolumeUsd ?? tokenRow?.volumeUsd));
    const liquidityUsd = Math.max(0, toNumber(assetRow.liquidityUsd));
    const createdAt = normalizeTimestamp(assetRow.createdAt);
    const ageHours = ageHoursFromIso(createdAt);
    const volumeVelocity = dayVolumeUsd / Math.max(1, ageHours);

    const mapped: DopplerAsset = {
      address,
      chainId,
      name: toNullableString(tokenRow?.name),
      symbol: toNullableString(tokenRow?.symbol),
      decimals: toNullableNumber(tokenRow?.decimals),
      marketCapUsd: round(marketCapUsd, 2),
      dayVolumeUsd: round(dayVolumeUsd, 2),
      liquidityUsd: round(liquidityUsd, 2),
      createdAt,
      ageHours: round(ageHours, 2),
      volumeVelocity: round(volumeVelocity, 2),
      holderCount: Math.max(0, Math.round(toNumber(tokenRow?.holderCount))),
      integrator: toNullableString(assetRow.integrator),
      creatorAddress: toNullableString(tokenRow?.creatorAddress),
      creatorLaunchCount: 1,
      numTokensToSell: toNullableNumber(assetRow.numTokensToSell),
      migrated: toBoolean(assetRow.migrated),
      percentDayChange: toNullableNumber(assetRow.percentDayChange),
      image: toNullableString(tokenRow?.image),
      isDerc20: typeof tokenRow?.isDerc20 === 'boolean' ? tokenRow.isDerc20 : null,
      sniperProtectionEnabled: toNumber(assetRow.numTokensToSell) > 0,
      source,
    };

    return mapped;
  }

  private applyIntegratorCounts(assets: DopplerAsset[]): DopplerAsset[] {
    const counts = new Map<string, number>();

    for (const asset of assets) {
      if (!asset.integrator) continue;
      const key = normalizeAddressLower(asset.integrator);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return assets.map((asset) => {
      if (!asset.integrator) {
        return { ...asset, creatorLaunchCount: 0 };
      }

      const count = counts.get(normalizeAddressLower(asset.integrator)) ?? 1;
      return { ...asset, creatorLaunchCount: count };
    });
  }

  private async fetchIndexerAssets(limit: number): Promise<DopplerAsset[]> {
    const boundedLimit = clampLimit(limit, 50);
    let assetRows: GraphqlAssetRow[] = [];

    try {
      const recentResponse = await this.indexerClient.request<GraphqlAssetsResponse>(RECENT_ASSETS_QUERY, {
        limit: boundedLimit,
      });
      assetRows = Array.isArray(recentResponse.assets?.items) ? recentResponse.assets.items : [];
    } catch (error) {
      logger.debug({ err: error }, 'Doppler indexer does not support createdAt ordering, retrying with default ordering');
      const defaultResponse = await this.indexerClient.request<GraphqlAssetsResponse>(DEFAULT_ASSETS_QUERY, {
        limit: boundedLimit,
      });
      assetRows = Array.isArray(defaultResponse.assets?.items) ? defaultResponse.assets.items : [];
    }

    const tokenResponse = await this.indexerClient.request<GraphqlTokensResponse>(TOKENS_QUERY, {
      limit: boundedLimit,
    });
    const tokenRows = Array.isArray(tokenResponse.tokens?.items) ? tokenResponse.tokens.items : [];

    const tokenByAddress = new Map<string, GraphqlTokenRow>();
    for (const token of tokenRows) {
      const address = toNullableString(token.address);
      if (!address) continue;
      tokenByAddress.set(normalizeAddressLower(address), token);
    }

    const mapped = assetRows
      .map((assetRow) => {
        const address = toNullableString(assetRow.address);
        const token = address ? tokenByAddress.get(normalizeAddressLower(address)) ?? null : null;
        return this.mapAssetRow(assetRow, token, 'indexer');
      })
      .filter((asset): asset is DopplerAsset => asset !== null)
      .filter((asset) => asset.chainId === BASE_CHAIN_ID);

    return this.applyIntegratorCounts(mapped);
  }

  private async fetchIndexerAssetDetails(address: string): Promise<DopplerAsset | null> {
    const [assetResponse, tokenResponse] = await Promise.all([
      this.indexerClient.request<GraphqlAssetsResponse>(ASSET_DETAILS_QUERY, {
        address,
      }),
      this.indexerClient.request<GraphqlTokensResponse>(TOKEN_DETAILS_QUERY, {
        address,
      }),
    ]);

    const assetRow = Array.isArray(assetResponse.assets?.items) ? assetResponse.assets.items[0] : undefined;
    const tokenRow = Array.isArray(tokenResponse.tokens?.items) ? tokenResponse.tokens.items[0] : undefined;

    if (!assetRow && !tokenRow) {
      return null;
    }

    const mapped = this.mapAssetRow(assetRow ?? {}, tokenRow ?? null, 'indexer');
    if (!mapped || mapped.chainId !== BASE_CHAIN_ID) {
      return null;
    }

    const integratorLaunchCount = mapped.integrator
      ? Array.from(this.knownAssets.values()).filter(
          (asset) => asset.integrator && normalizeAddressLower(asset.integrator) === normalizeAddressLower(mapped.integrator || '')
        ).length
      : 0;

    return {
      ...mapped,
      creatorLaunchCount: mapped.integrator ? Math.max(1, integratorLaunchCount) : 0,
    };
  }

  private getFallbackAddresses(maxCount: number): Address[] {
    const envAddresses = (process.env.DOPPLER_FALLBACK_ASSETS || '')
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    const knownAddresses = Array.from(this.knownAssets.keys());
    const merged = uniqueAddresses([...envAddresses, ...knownAddresses]).slice(0, maxCount);

    return merged.filter((candidate): candidate is Address => this.viem.isAddress(candidate));
  }

  private async getRecentLaunchesFromRpc(hours: number, limit: number): Promise<DopplerAsset[]> {
    const fallbackAddresses = this.getFallbackAddresses(Math.max(limit * 5, 40));
    if (fallbackAddresses.length === 0) {
      logger.warn('No fallback Doppler addresses available for recent launches RPC fallback');
      return [];
    }

    const fetched = await Promise.allSettled(
      fallbackAddresses.map((address) => this.fetchAssetFromRpc(address, this.knownAssets.get(normalizeAddressLower(address))))
    );

    const recent = fetched
      .flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))
      .filter((asset) => asset.ageHours <= hours)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, limit);

    return this.applyIntegratorCounts(recent);
  }

  private async getTrendingFromRpc(limit: number): Promise<DopplerAsset[]> {
    const fallbackAddresses = this.getFallbackAddresses(Math.max(limit * 5, 40));
    if (fallbackAddresses.length === 0) {
      logger.warn('No fallback Doppler addresses available for trending RPC fallback');
      return [];
    }

    const fetched = await Promise.allSettled(
      fallbackAddresses.map((address) => this.fetchAssetFromRpc(address, this.knownAssets.get(normalizeAddressLower(address))))
    );

    const sorted = fetched
      .flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))
      .sort((a, b) => b.volumeVelocity - a.volumeVelocity)
      .slice(0, limit);

    return this.applyIntegratorCounts(sorted);
  }

  private async inferCreatedAtFromLogs(address: Address, fallbackTimestamp: string): Promise<string> {
    try {
      const latestBlock = await this.publicClient.getBlockNumber();
      const fromBlock = latestBlock > BigInt(FALLBACK_LOOKBACK_BLOCKS) ? latestBlock - BigInt(FALLBACK_LOOKBACK_BLOCKS) : 0n;

      const logs = await this.publicClient.getLogs({
        address,
        event: this.transferEvent,
        fromBlock,
        toBlock: latestBlock,
      });

      let earliestBlock: bigint | null = null;
      for (const log of logs) {
        if (typeof log.blockNumber !== 'bigint') continue;
        if (earliestBlock === null || log.blockNumber < earliestBlock) {
          earliestBlock = log.blockNumber;
        }
      }

      if (earliestBlock === null) {
        return fallbackTimestamp;
      }

      const block = await this.publicClient.getBlock({ blockNumber: earliestBlock });
      const timestamp = Number(block.timestamp);
      if (!Number.isFinite(timestamp) || timestamp <= 0) {
        return fallbackTimestamp;
      }

      return new Date(timestamp * 1000).toISOString();
    } catch (error) {
      logger.debug({ err: error, address }, 'Failed to infer token creation timestamp from transfer logs');
      return fallbackTimestamp;
    }
  }

  private async fetchAssetFromRpc(address: Address, seed: DopplerAsset | undefined): Promise<DopplerAsset> {
    const bytecode = await this.publicClient.getBytecode({ address });
    if (!bytecode) {
      throw new Error(`No contract bytecode found for ${address}`);
    }

    const [nameResult, symbolResult, decimalsResult] = await Promise.allSettled([
      this.publicClient.readContract({
        address,
        abi: this.erc20Abi,
        functionName: 'name',
      }),
      this.publicClient.readContract({
        address,
        abi: this.erc20Abi,
        functionName: 'symbol',
      }),
      this.publicClient.readContract({
        address,
        abi: this.erc20Abi,
        functionName: 'decimals',
      }),
    ]);

    const fallbackTimestamp = seed?.createdAt || new Date().toISOString();
    const createdAt = await this.inferCreatedAtFromLogs(address, fallbackTimestamp);
    const ageHours = ageHoursFromIso(createdAt);
    const dayVolumeUsd = seed?.dayVolumeUsd ?? 0;

    const mapped: DopplerAsset = {
      address,
      chainId: BASE_CHAIN_ID,
      name: nameResult.status === 'fulfilled' ? String(nameResult.value) : seed?.name ?? null,
      symbol: symbolResult.status === 'fulfilled' ? String(symbolResult.value) : seed?.symbol ?? null,
      decimals: decimalsResult.status === 'fulfilled' ? Number(decimalsResult.value) : seed?.decimals ?? null,
      marketCapUsd: seed?.marketCapUsd ?? 0,
      dayVolumeUsd,
      liquidityUsd: seed?.liquidityUsd ?? 0,
      createdAt,
      ageHours: round(ageHours, 2),
      volumeVelocity: round(dayVolumeUsd / Math.max(1, ageHours), 2),
      holderCount: seed?.holderCount ?? 0,
      integrator: seed?.integrator ?? null,
      creatorAddress: seed?.creatorAddress ?? null,
      creatorLaunchCount: seed?.creatorLaunchCount ?? 0,
      numTokensToSell: seed?.numTokensToSell ?? null,
      migrated: seed?.migrated ?? false,
      percentDayChange: seed?.percentDayChange ?? null,
      image: seed?.image ?? null,
      isDerc20: seed?.isDerc20 ?? null,
      sniperProtectionEnabled: seed?.sniperProtectionEnabled ?? false,
      source: 'rpc',
    };

    return mapped;
  }
}

export const dopplerClient = new DopplerClient();

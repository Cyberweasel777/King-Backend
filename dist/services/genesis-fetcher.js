"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllLaunches = getAllLaunches;
exports.getActiveLaunches = getActiveLaunches;
const web3_js_1 = require("@solana/web3.js");
const DEFAULT_SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';
const GENESIS_PROGRAM_ID = 'GNS1S5J5AspKXgpjz6SvKL66kPaKWAhaGRhCqPRxii2B';
const CACHE_TTL_MS = 5 * 60 * 1000;
const METADATA_CACHE_TTL_MS = 60 * 60 * 1000;
const METADATA_FETCH_TIMEOUT_MS = 4000;
let sdkCache = null;
let inMemoryCache = {
    launches: [],
    updatedAt: new Date(0).toISOString(),
    stale: false,
};
let lastSuccessfulRefreshMs = 0;
let inflightRefresh = null;
const metadataNameCache = new Map();
function loadGenesisSdk() {
    if (sdkCache) {
        return sdkCache;
    }
    try {
        // Use runtime requires so type-checking still works if deps are missing locally.
        const genesisModule = require('@metaplex-foundation/genesis');
        const umiModule = require('@metaplex-foundation/umi');
        const umiDefaultsModule = require('@metaplex-foundation/umi-bundle-defaults');
        const createUmi = umiDefaultsModule.createUmi;
        const createMplGenesis = genesisModule.createMplGenesis;
        const fetchAllGenesisAccountV2 = genesisModule.fetchAllGenesisAccountV2;
        const getBucketStateGpaBuilder = genesisModule.getBucketStateGpaBuilder;
        const publicKey = umiModule.publicKey;
        if (typeof createUmi !== 'function' ||
            typeof createMplGenesis !== 'function' ||
            typeof fetchAllGenesisAccountV2 !== 'function' ||
            typeof getBucketStateGpaBuilder !== 'function' ||
            typeof publicKey !== 'function') {
            throw new Error('Metaplex Genesis SDK exports are unavailable.');
        }
        sdkCache = {
            createUmi: createUmi,
            createMplGenesis: createMplGenesis,
            fetchAllGenesisAccountV2: fetchAllGenesisAccountV2,
            getBucketStateGpaBuilder: getBucketStateGpaBuilder,
            publicKey: publicKey,
        };
        return sdkCache;
    }
    catch (error) {
        const reason = error instanceof Error ? error.message : 'unknown error';
        throw new Error(`Metaplex Genesis dependencies missing or invalid (${reason}). Install @metaplex-foundation/genesis, @metaplex-foundation/umi, @metaplex-foundation/umi-bundle-defaults.`);
    }
}
function getRpcUrl() {
    return process.env.SOLANA_RPC_URL || DEFAULT_SOLANA_RPC_URL;
}
function enumKind(value) {
    if (typeof value === 'string') {
        return value;
    }
    if (value && typeof value === 'object' && '__kind' in value) {
        const kind = value.__kind;
        if (typeof kind === 'string') {
            return kind;
        }
    }
    return 'Unknown';
}
function normalizeLaunchType(value) {
    switch (enumKind(value).toLowerCase()) {
        case 'pool':
            return 'pool';
        case 'presale':
            return 'presale';
        case 'auction':
            return 'auction';
        default:
            return 'unknown';
    }
}
function toBigInt(value) {
    if (typeof value === 'bigint') {
        return value;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        return BigInt(Math.trunc(value));
    }
    if (typeof value === 'string') {
        try {
            return BigInt(value);
        }
        catch {
            return 0n;
        }
    }
    if (value && typeof value === 'object' && 'toString' in value) {
        try {
            return BigInt(String(value));
        }
        catch {
            return 0n;
        }
    }
    return 0n;
}
function sumBigInt(values, mapper) {
    return values.reduce((total, value) => total + mapper(value), 0n);
}
function toTimestampSeconds(value) {
    const raw = toBigInt(value);
    const asNumber = Number(raw);
    if (!Number.isFinite(asNumber) || asNumber <= 0) {
        return null;
    }
    return asNumber;
}
function toIsoTimestamp(value) {
    if (value === null) {
        return null;
    }
    return new Date(value * 1000).toISOString();
}
function parseIsoToSeconds(value) {
    if (!value) {
        return null;
    }
    const ms = Date.parse(value);
    if (!Number.isFinite(ms)) {
        return null;
    }
    return Math.floor(ms / 1000);
}
function isWindowOpen(nowSeconds, startSeconds, endSeconds) {
    if (startSeconds === null && endSeconds === null) {
        return false;
    }
    if (startSeconds !== null && nowSeconds < startSeconds) {
        return false;
    }
    if (endSeconds !== null && nowSeconds > endSeconds) {
        return false;
    }
    return true;
}
function deriveStatus(nowSeconds, depositStart, depositEnd, claimStart, claimEnd) {
    if (isWindowOpen(nowSeconds, depositStart, depositEnd) || isWindowOpen(nowSeconds, claimStart, claimEnd)) {
        return 'active';
    }
    const starts = [depositStart, claimStart].filter((value) => value !== null);
    const ends = [depositEnd, claimEnd].filter((value) => value !== null);
    if (ends.length > 0 && nowSeconds > Math.max(...ends)) {
        return 'completed';
    }
    if (starts.length > 0 && nowSeconds < Math.min(...starts)) {
        return 'upcoming';
    }
    return ends.length > 0 ? 'completed' : 'upcoming';
}
function shortMintFallback(mint) {
    if (mint.length <= 10) {
        return mint;
    }
    return `${mint.slice(0, 4)}...${mint.slice(-4)}`;
}
function normalizeString(value) {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
function mapFeeRecipients(fees) {
    if (!fees || typeof fees !== 'object' || !('recipients' in fees)) {
        return [];
    }
    const recipients = fees.recipients;
    if (!Array.isArray(recipients)) {
        return [];
    }
    return recipients
        .map((recipient) => {
        const address = recipient && typeof recipient === 'object' && 'address' in recipient ? String(recipient.address ?? '') : '';
        const percentageValue = recipient && typeof recipient === 'object' && 'percentage' in recipient ? Number(recipient.percentage ?? 0) : 0;
        return {
            address,
            percentage: Number.isFinite(percentageValue) ? percentageValue : 0,
        };
    })
        .filter((recipient) => recipient.address.length > 0);
}
async function fetchLaunchName(metadataUrl, mint) {
    if (!metadataUrl) {
        return shortMintFallback(mint);
    }
    const cached = metadataNameCache.get(metadataUrl);
    if (cached && Date.now() - cached.fetchedAt < METADATA_CACHE_TTL_MS) {
        return cached.name;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), METADATA_FETCH_TIMEOUT_MS);
    try {
        const response = await fetch(metadataUrl, {
            signal: controller.signal,
            headers: { Accept: 'application/json' },
        });
        if (!response.ok) {
            throw new Error(`metadata HTTP ${response.status}`);
        }
        const payload = (await response.json());
        const parsedName = normalizeString(payload.name);
        if (parsedName) {
            metadataNameCache.set(metadataUrl, { name: parsedName, fetchedAt: Date.now() });
            return parsedName;
        }
    }
    catch {
        // Ignore metadata fetch failures; fallback to mint-derived label below.
    }
    finally {
        clearTimeout(timeout);
    }
    const fallback = shortMintFallback(mint);
    metadataNameCache.set(metadataUrl, { name: fallback, fetchedAt: Date.now() });
    return fallback;
}
async function getBucketStateAccounts(umi, sdk, genesisPublicKey) {
    const builder = sdk.getBucketStateGpaBuilder(umi);
    const filteredBuilder = builder && typeof builder.whereField === 'function' ? builder.whereField('genesisAddress', sdk.publicKey(genesisPublicKey)) : builder;
    if (filteredBuilder && typeof filteredBuilder.getDeserialized === 'function') {
        return (await filteredBuilder.getDeserialized());
    }
    if (filteredBuilder && typeof filteredBuilder.get === 'function') {
        const raw = await filteredBuilder.get();
        if (!Array.isArray(raw)) {
            return [];
        }
        return raw.map((item) => (item && typeof item === 'object' && 'account' in item ? item.account : item));
    }
    return [];
}
async function fetchFromChain() {
    const sdk = loadGenesisSdk();
    const rpcUrl = getRpcUrl();
    const connection = new web3_js_1.Connection(rpcUrl, 'confirmed');
    const umi = sdk.createUmi(rpcUrl).use(sdk.createMplGenesis());
    const genesisProgramId = new web3_js_1.PublicKey(GENESIS_PROGRAM_ID);
    const programAccounts = await connection.getProgramAccounts(genesisProgramId, {
        commitment: 'confirmed',
        dataSlice: { offset: 0, length: 0 },
    });
    if (programAccounts.length === 0) {
        return [];
    }
    const genesisPublicKeys = programAccounts.map(({ pubkey }) => sdk.publicKey(pubkey.toBase58()));
    const genesisAccounts = await sdk.fetchAllGenesisAccountV2(umi, genesisPublicKeys);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const launches = await Promise.all(genesisAccounts.map(async (account, index) => {
        const genesisAccount = normalizeString(account?.publicKey?.toString?.()) || programAccounts[index]?.pubkey.toBase58() || '';
        const parsedLaunchData = account?.parsedLaunchData ?? {};
        const bucketConfigList = Array.isArray(parsedLaunchData?.bucketConfig) ? parsedLaunchData.bucketConfig : [];
        const bucketConfigByToken = new Map();
        for (const entry of bucketConfigList) {
            const tokenAddress = normalizeString(entry?.tokenAddress?.toString?.());
            if (tokenAddress) {
                bucketConfigByToken.set(tokenAddress, entry);
            }
        }
        const bucketStates = genesisAccount ? await getBucketStateAccounts(umi, sdk, genesisAccount) : [];
        let mint = '';
        let metadataUrl = null;
        let totalDeposits = 0n;
        let tokenAllocation = 0n;
        const buckets = bucketStates.map((bucketState) => {
            const bucketStateKey = normalizeString(bucketState?.publicKey?.toString?.()) || '';
            const tokenMint = normalizeString(bucketState?.tokenMint?.toString?.()) || '';
            const stateMetadataUrl = normalizeString(bucketState?.metaDataUrl) || null;
            const maxTokenCapacity = toBigInt(bucketState?.maxTokenCapacity);
            const launchState = enumKind(bucketState?.launchState).toLowerCase();
            if (!mint && tokenMint) {
                mint = tokenMint;
            }
            if (!metadataUrl && stateMetadataUrl) {
                metadataUrl = stateMetadataUrl;
            }
            const stateBuckets = Array.isArray(bucketState?.buckets) ? bucketState.buckets : [];
            const currentSol = sumBigInt(stateBuckets, (entry) => toBigInt(entry?.currentSol));
            const currentTokenAllocation = sumBigInt(stateBuckets, (entry) => toBigInt(entry?.currentTokenAllocation));
            const claimedAmount = sumBigInt(stateBuckets, (entry) => toBigInt(entry?.claimedAmount));
            const maxCapacity = sumBigInt(stateBuckets, (entry) => toBigInt(entry?.maxCapacity));
            const limitPerUser = sumBigInt(stateBuckets, (entry) => toBigInt(entry?.limitPerUser));
            totalDeposits += currentSol;
            tokenAllocation += currentTokenAllocation;
            const matchingBucketConfig = bucketConfigByToken.get(tokenMint);
            const creatorFees = mapFeeRecipients(matchingBucketConfig?.creatorFees ?? parsedLaunchData?.creatorFee);
            return {
                bucketState: bucketStateKey,
                tokenMint,
                metadataUrl: stateMetadataUrl,
                maxTokenCapacity: maxTokenCapacity.toString(),
                launchState,
                currentSol: currentSol.toString(),
                currentTokenAllocation: currentTokenAllocation.toString(),
                claimedAmount: claimedAmount.toString(),
                maxCapacity: maxCapacity.toString(),
                limitPerUser: limitPerUser.toString(),
                creatorFees,
            };
        });
        if (!mint) {
            mint =
                normalizeString(parsedLaunchData?.quoteToken?.toString?.()) ||
                    normalizeString(bucketConfigList[0]?.tokenAddress?.toString?.()) ||
                    genesisAccount;
        }
        const name = await fetchLaunchName(metadataUrl, mint || genesisAccount);
        const depositStart = toTimestampSeconds(parsedLaunchData?.startDeposit);
        const depositEnd = toTimestampSeconds(parsedLaunchData?.endDeposit);
        const claimStart = toTimestampSeconds(parsedLaunchData?.startClaim);
        const claimEnd = toTimestampSeconds(parsedLaunchData?.endClaim);
        const status = deriveStatus(nowSeconds, depositStart, depositEnd, claimStart, claimEnd);
        if (tokenAllocation === 0n) {
            tokenAllocation = sumBigInt(buckets, (bucket) => toBigInt(bucket.maxTokenCapacity));
        }
        return {
            mint,
            name,
            launchType: normalizeLaunchType(parsedLaunchData?.launchType),
            depositStart: toIsoTimestamp(depositStart),
            depositEnd: toIsoTimestamp(depositEnd),
            claimStart: toIsoTimestamp(claimStart),
            claimEnd: toIsoTimestamp(claimEnd),
            totalDeposits: totalDeposits.toString(),
            tokenAllocation: tokenAllocation.toString(),
            status,
            genesisAccount,
            buckets,
        };
    }));
    return launches
        .filter((launch) => launch.genesisAccount.length > 0)
        .sort((a, b) => a.depositStart?.localeCompare(b.depositStart || '') || 0);
}
function cacheIsFresh() {
    return lastSuccessfulRefreshMs > 0 && Date.now() - lastSuccessfulRefreshMs < CACHE_TTL_MS;
}
async function refreshCache(force = false) {
    if (!force && cacheIsFresh()) {
        return { ...inMemoryCache, stale: false, error: undefined };
    }
    if (inflightRefresh) {
        return inflightRefresh;
    }
    inflightRefresh = (async () => {
        try {
            const launches = await fetchFromChain();
            inMemoryCache = {
                launches,
                updatedAt: new Date().toISOString(),
                stale: false,
            };
            lastSuccessfulRefreshMs = Date.now();
            return { ...inMemoryCache };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to fetch Genesis launch data';
            const fallbackUpdatedAt = inMemoryCache.updatedAt && inMemoryCache.updatedAt !== new Date(0).toISOString()
                ? inMemoryCache.updatedAt
                : new Date().toISOString();
            return {
                launches: inMemoryCache.launches,
                updatedAt: fallbackUpdatedAt,
                stale: true,
                error: message,
            };
        }
        finally {
            inflightRefresh = null;
        }
    })();
    return inflightRefresh;
}
async function getAllLaunches() {
    return refreshCache(false);
}
async function getActiveLaunches() {
    const response = await refreshCache(false);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const launches = response.launches
        .map((launch) => {
        const depositStart = parseIsoToSeconds(launch.depositStart);
        const depositEnd = parseIsoToSeconds(launch.depositEnd);
        const claimStart = parseIsoToSeconds(launch.claimStart);
        const claimEnd = parseIsoToSeconds(launch.claimEnd);
        const status = deriveStatus(nowSeconds, depositStart, depositEnd, claimStart, claimEnd);
        return {
            ...launch,
            status,
        };
    })
        .filter((launch) => launch.status === 'active');
    return {
        ...response,
        launches,
    };
}
//# sourceMappingURL=genesis-fetcher.js.map
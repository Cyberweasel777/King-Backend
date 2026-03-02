/**
 * BotIndex Token Universe Builder
 * Expands beyond a small static list by discovering additional Solana token profiles
 * from DexScreener, while preserving a stable core universe.
 */

const CORE_TOKEN_UNIVERSE = [
  'solana:So11111111111111111111111111111111111111112', // SOL
  'solana:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'solana:Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  'solana:DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', // BONK
  'solana:EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', // WIF
  'solana:7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', // SAMO
  'solana:6D7NaBmqsFEK14vgtgBaHwLxBozrMBF3ZgJy5mR8yXrw', // MYRO
] as const;

type DexProfile = {
  tokenAddress?: string;
  chainId?: string;
};

const PROFILE_URL = 'https://api.dexscreener.com/token-profiles/latest/v1';
const CACHE_TTL_MS = 5 * 60 * 1000;

let cachedUniverse: string[] | null = null;
let cachedAt = 0;

function isLikelyBase58Address(value: string): boolean {
  // Solana addresses are base58 and typically 32-44 chars.
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}

export async function getBotindexTokenUniverse(targetSize: number = 30): Promise<string[]> {
  const now = Date.now();
  if (cachedUniverse && now - cachedAt < CACHE_TTL_MS) {
    return cachedUniverse;
  }

  const desiredSize = Math.max(targetSize, CORE_TOKEN_UNIVERSE.length);

  try {
    const response = await fetch(PROFILE_URL, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'BotIndex/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`Token profile fetch failed: HTTP ${response.status}`);
    }

    const profiles = (await response.json()) as DexProfile[];

    const dynamic = profiles
      .filter((p) => p?.chainId === 'solana' && typeof p?.tokenAddress === 'string')
      .map((p) => (p.tokenAddress || '').trim())
      .filter((addr) => isLikelyBase58Address(addr))
      .map((addr) => `solana:${addr}`)
      .filter((token) => !CORE_TOKEN_UNIVERSE.includes(token as (typeof CORE_TOKEN_UNIVERSE)[number]));

    const deduped = Array.from(new Set([...CORE_TOKEN_UNIVERSE, ...dynamic]));
    const finalUniverse = deduped.slice(0, desiredSize);

    cachedUniverse = finalUniverse;
    cachedAt = now;

    return finalUniverse;
  } catch {
    const fallback = [...CORE_TOKEN_UNIVERSE];
    cachedUniverse = fallback;
    cachedAt = now;
    return fallback;
  }
}

export function getCoreBotindexTokenUniverse(): string[] {
  return [...CORE_TOKEN_UNIVERSE];
}

export type ZoraCreatorScore = {
  address: string;
  username: string;
  coinSymbol: string;
  totalVolume: number;
  holderCount: number;
  feeEarnings: number;
  score: number;
};

export type ZoraCreatorScoresResponse = {
  creators: ZoraCreatorScore[];
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const creatorScoresCache = new Map<number, { data: ZoraCreatorScoresResponse; expiresAt: number }>();

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit < 1) return 10;
  return Math.min(Math.floor(limit), 50);
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function getSeedCreatorScores(): ZoraCreatorScore[] {
  return [
    {
      address: '0xa111111111111111111111111111111111111111',
      username: 'mintedbymaya',
      coinSymbol: 'MAYA',
      totalVolume: 4921500.22,
      holderCount: 18452,
      feeEarnings: 37015.82,
      score: 94.3,
    },
    {
      address: '0xa222222222222222222222222222222222222222',
      username: 'chainatelier',
      coinSymbol: 'ATLR',
      totalVolume: 3812030.89,
      holderCount: 15203,
      feeEarnings: 30102.44,
      score: 89.74,
    },
    {
      address: '0xa333333333333333333333333333333333333333',
      username: 'postclub',
      coinSymbol: 'PST',
      totalVolume: 3319122.1,
      holderCount: 14771,
      feeEarnings: 27812.59,
      score: 87.45,
    },
    {
      address: '0xa444444444444444444444444444444444444444',
      username: 'onchainriley',
      coinSymbol: 'RLY',
      totalVolume: 2804403.44,
      holderCount: 12194,
      feeEarnings: 21908.83,
      score: 83.63,
    },
    {
      address: '0xa555555555555555555555555555555555555555',
      username: 'basebloom',
      coinSymbol: 'BLM',
      totalVolume: 2276020.73,
      holderCount: 10163,
      feeEarnings: 19841.06,
      score: 80.91,
    },
    {
      address: '0xa666666666666666666666666666666666666666',
      username: 'frameoperator',
      coinSymbol: 'FRAME',
      totalVolume: 2031456.51,
      holderCount: 9339,
      feeEarnings: 17266.95,
      score: 78.38,
    },
    {
      address: '0xa777777777777777777777777777777777777777',
      username: 'cc0signal',
      coinSymbol: 'CC0',
      totalVolume: 1865212.19,
      holderCount: 8624,
      feeEarnings: 15911.32,
      score: 76.82,
    },
    {
      address: '0xa888888888888888888888888888888888888888',
      username: 'capsulelabs',
      coinSymbol: 'CAPS',
      totalVolume: 1603201.03,
      holderCount: 7311,
      feeEarnings: 13643.27,
      score: 73.07,
    },
  ].map((creator) => ({
    ...creator,
    totalVolume: round(creator.totalVolume, 2),
    feeEarnings: round(creator.feeEarnings, 2),
    score: round(creator.score, 2),
  }));
}

export async function getZoraCreatorScores(limit: number): Promise<ZoraCreatorScoresResponse> {
  const normalizedLimit = normalizeLimit(limit);
  const now = Date.now();
  const cached = creatorScoresCache.get(normalizedLimit);

  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const creators = getSeedCreatorScores()
    .sort((a, b) => b.score - a.score)
    .slice(0, normalizedLimit);

  const data: ZoraCreatorScoresResponse = { creators };
  creatorScoresCache.set(normalizedLimit, { data, expiresAt: now + CACHE_TTL_MS });

  return data;
}

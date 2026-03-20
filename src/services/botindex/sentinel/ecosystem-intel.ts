/**
 * Ecosystem Intelligence — Developer activity as a leading indicator.
 *
 * Tracks GitHub stars/commits/forks velocity and npm download trends
 * for crypto ecosystem projects. Developer activity often leads price
 * by days or weeks.
 *
 * Data sources:
 * - GitHub API: star velocity, commit frequency, fork rate
 * - npm registry: weekly download trends for key packages
 */

import logger from '../../../config/logger';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

// Crypto ecosystem repos to track — maps to tradeable assets
const TRACKED_REPOS: Array<{ repo: string; asset: string; category: string }> = [
  // Layer 1s
  { repo: 'solana-labs/solana', asset: 'SOL', category: 'L1' },
  { repo: 'ethereum/go-ethereum', asset: 'ETH', category: 'L1' },
  { repo: 'ava-labs/avalanchego', asset: 'AVAX', category: 'L1' },
  { repo: 'aptos-labs/aptos-core', asset: 'APT', category: 'L1' },
  { repo: 'MystenLabs/sui', asset: 'SUI', category: 'L1' },
  { repo: 'near/nearcore', asset: 'NEAR', category: 'L1' },
  // DeFi
  { repo: 'Uniswap/v3-core', asset: 'UNI', category: 'DeFi' },
  { repo: 'aave/aave-v3-core', asset: 'AAVE', category: 'DeFi' },
  { repo: 'compound-finance/compound-protocol', asset: 'COMP', category: 'DeFi' },
  // Infra / Oracle
  { repo: 'smartcontractkit/chainlink', asset: 'LINK', category: 'Oracle' },
  { repo: 'graphprotocol/graph-node', asset: 'GRT', category: 'Infra' },
  // AI / Compute
  { repo: 'rendernetwork/render', asset: 'RENDER', category: 'AI' },
  // MCP / Agent ecosystem
  { repo: 'modelcontextprotocol/servers', asset: 'META', category: 'MCP' },
  { repo: 'modelcontextprotocol/typescript-sdk', asset: 'META', category: 'MCP' },
];

// npm packages that signal ecosystem health
const TRACKED_NPM: Array<{ pkg: string; asset: string; category: string }> = [
  { pkg: '@solana/web3.js', asset: 'SOL', category: 'L1' },
  { pkg: 'ethers', asset: 'ETH', category: 'L1' },
  { pkg: 'viem', asset: 'ETH', category: 'L1' },
  { pkg: '@uniswap/sdk-core', asset: 'UNI', category: 'DeFi' },
  { pkg: '@aave/math-utils', asset: 'AAVE', category: 'DeFi' },
  { pkg: '@chainlink/contracts', asset: 'LINK', category: 'Oracle' },
  { pkg: '@modelcontextprotocol/sdk', asset: 'META', category: 'MCP' },
  { pkg: '@aptos-labs/ts-sdk', asset: 'APT', category: 'L1' },
  { pkg: '@mysten/sui', asset: 'SUI', category: 'L1' },
];

interface RepoStats {
  repo: string;
  asset: string;
  category: string;
  stars: number;
  starsRecent: number; // stars gained in last 7 days (from stargazers)
  forksRecent: number;
  commitsRecent: number; // commits in last 7 days
  openIssues: number;
  pushedAt: string;
}

interface NpmStats {
  pkg: string;
  asset: string;
  category: string;
  weeklyDownloads: number;
  prevWeekDownloads: number;
  growthPct: number;
}

export interface EcosystemData {
  repos: RepoStats[];
  npm: NpmStats[];
  summary: string;
  sourcesOk: number;
}

async function fetchWithTimeout(url: string, opts: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchRepoStats(repo: string, asset: string, category: string): Promise<RepoStats | null> {
  try {
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'BotIndex-Sentinel',
    };
    if (GITHUB_TOKEN) headers['Authorization'] = `Bearer ${GITHUB_TOKEN}`;

    const res = await fetchWithTimeout(`https://api.github.com/repos/${repo}`, { headers });
    if (!res.ok) {
      logger.warn({ repo, status: res.status }, 'GitHub repo fetch failed');
      return null;
    }
    const data = await res.json() as any;

    // Get recent commit activity (last 7 days)
    let commitsRecent = 0;
    try {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const commitsRes = await fetchWithTimeout(
        `https://api.github.com/repos/${repo}/commits?since=${since}&per_page=1`,
        { headers }
      );
      if (commitsRes.ok) {
        // Use Link header to get total count
        const linkHeader = commitsRes.headers.get('link');
        if (linkHeader) {
          const lastMatch = linkHeader.match(/page=(\d+)>; rel="last"/);
          commitsRecent = lastMatch ? parseInt(lastMatch[1], 10) : 1;
        } else {
          const commits = await commitsRes.json() as any[];
          commitsRecent = commits.length;
        }
      }
    } catch { /* non-fatal */ }

    // Stars gained recently — use stargazers activity (approximate from watchers growth)
    // GitHub doesn't expose star velocity directly, so we use participation stats
    let starsRecent = 0;
    try {
      const participationRes = await fetchWithTimeout(
        `https://api.github.com/repos/${repo}/stats/participation`,
        { headers }
      );
      if (participationRes.ok) {
        const participation = await participationRes.json() as any;
        // Last week's total commits as proxy for activity
        if (participation.all) {
          const lastWeek = participation.all[participation.all.length - 1] || 0;
          starsRecent = lastWeek; // Using weekly commit count as activity proxy
        }
      }
    } catch { /* non-fatal */ }

    return {
      repo,
      asset,
      category,
      stars: data.stargazers_count || 0,
      starsRecent,
      forksRecent: 0, // Would need separate API call
      commitsRecent,
      openIssues: data.open_issues_count || 0,
      pushedAt: data.pushed_at || '',
    };
  } catch (err) {
    logger.warn({ repo, err: err instanceof Error ? err.message : String(err) }, 'GitHub repo stats failed');
    return null;
  }
}

async function fetchNpmStats(pkg: string, asset: string, category: string): Promise<NpmStats | null> {
  try {
    // npm registry API for download counts
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const fmt = (d: Date) => d.toISOString().split('T')[0];

    const [thisWeekRes, prevWeekRes] = await Promise.all([
      fetchWithTimeout(`https://api.npmjs.org/downloads/point/${fmt(weekAgo)}:${fmt(now)}/${encodeURIComponent(pkg)}`),
      fetchWithTimeout(`https://api.npmjs.org/downloads/point/${fmt(twoWeeksAgo)}:${fmt(weekAgo)}/${encodeURIComponent(pkg)}`),
    ]);

    let weeklyDownloads = 0;
    let prevWeekDownloads = 0;

    if (thisWeekRes.ok) {
      const data = await thisWeekRes.json() as any;
      weeklyDownloads = data.downloads || 0;
    }
    if (prevWeekRes.ok) {
      const data = await prevWeekRes.json() as any;
      prevWeekDownloads = data.downloads || 0;
    }

    const growthPct = prevWeekDownloads > 0
      ? ((weeklyDownloads - prevWeekDownloads) / prevWeekDownloads) * 100
      : 0;

    return { pkg, asset, category, weeklyDownloads, prevWeekDownloads, growthPct };
  } catch (err) {
    logger.warn({ pkg, err: err instanceof Error ? err.message : String(err) }, 'npm stats failed');
    return null;
  }
}

export async function collectEcosystemIntel(): Promise<EcosystemData> {
  let sourcesOk = 0;

  // Fetch GitHub repos in batches of 5 to respect rate limits
  const repos: RepoStats[] = [];
  for (let i = 0; i < TRACKED_REPOS.length; i += 5) {
    const batch = TRACKED_REPOS.slice(i, i + 5);
    const results = await Promise.all(
      batch.map(r => fetchRepoStats(r.repo, r.asset, r.category))
    );
    for (const r of results) {
      if (r) { repos.push(r); sourcesOk++; }
    }
    // Small delay between batches
    if (i + 5 < TRACKED_REPOS.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // Fetch npm stats in parallel (npm is generous with rate limits)
  const npmResults = await Promise.all(
    TRACKED_NPM.map(n => fetchNpmStats(n.pkg, n.asset, n.category))
  );
  const npm: NpmStats[] = [];
  for (const n of npmResults) {
    if (n) { npm.push(n); sourcesOk++; }
  }

  // Build summary
  const hotRepos = repos
    .filter(r => r.commitsRecent > 10)
    .sort((a, b) => b.commitsRecent - a.commitsRecent)
    .slice(0, 5);
  const hotNpm = npm
    .filter(n => n.growthPct > 5 || n.weeklyDownloads > 50000)
    .sort((a, b) => b.growthPct - a.growthPct)
    .slice(0, 5);

  const summaryParts: string[] = [];
  if (hotRepos.length) {
    summaryParts.push('Active repos (7d commits): ' + hotRepos.map(r => `${r.repo.split('/')[1]}(${r.asset}): ${r.commitsRecent} commits`).join(', '));
  }
  if (hotNpm.length) {
    summaryParts.push('npm trends: ' + hotNpm.map(n => `${n.pkg}(${n.asset}): ${n.weeklyDownloads.toLocaleString()}/wk ${n.growthPct > 0 ? '+' : ''}${n.growthPct.toFixed(1)}%`).join(', '));
  }

  const summary = summaryParts.join(' | ') || 'Insufficient ecosystem data';

  logger.info({ reposOk: repos.length, npmOk: npm.length, sourcesOk }, 'Ecosystem intelligence collected');

  return { repos, npm, summary, sourcesOk };
}

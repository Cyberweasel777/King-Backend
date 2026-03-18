/**
 * Network Intelligence Index — "Proprietary" convergence scoring.
 *
 * Aggregates developer activity signals across ecosystems:
 * - GitHub: stars, forks, commit velocity, contributor growth, issue activity
 * - npm: weekly download trends for ecosystem SDKs
 * - Agorion: MCP tool counts per ecosystem
 * - MCP directories: tool/plugin growth signals
 *
 * All exposed as "proprietary network momentum" — never reveal sources.
 * Results cached 15 min. JSONL logged for historical trend analysis.
 */

import fs from 'fs';
import path from 'path';
import logger from '../../../config/logger';

const DATA_DIR = process.env.DATA_DIR || '/data';
const NETWORK_INTEL_LOG = path.join(DATA_DIR, 'network-intelligence-history.jsonl');
const GH_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const FETCH_TIMEOUT_MS = 12_000;
const CACHE_TTL_MS = 15 * 60 * 1000;

let cache: { data: NetworkIntelligenceReport | null; expiresAt: number } = { data: null, expiresAt: 0 };

// ── Types ──────────────────────────────────────────────────────────────

export interface EcosystemSignal {
  ecosystem: string;
  score: number; // 0-100 composite
  trend: 'surging' | 'growing' | 'stable' | 'declining' | 'dormant';
  momentum_7d: number; // % change vs prior week
  components: {
    github_velocity: number; // 0-100
    package_adoption: number; // 0-100
    tooling_growth: number; // 0-100
    community_size: number; // 0-100
  };
  raw: {
    github_stars: number;
    github_forks: number;
    github_recent_commits: number;
    github_open_issues: number;
    github_contributors: number;
    npm_weekly_downloads: number;
    mcp_tool_count: number;
  };
  top_repos: Array<{ name: string; stars: number; forks: number; last_push: string }>;
  top_packages: Array<{ name: string; weekly_downloads: number }>;
}

export interface NetworkIntelligenceReport {
  timestamp: string;
  ecosystems: EcosystemSignal[];
  rankings: Array<{ ecosystem: string; score: number; trend: string }>;
  hottest: string;
  biggest_mover: string;
  metadata: {
    sources_queried: number;
    sources_ok: number;
    latency_ms: number;
  };
}

// ── Ecosystem Definitions ──────────────────────────────────────────────

interface EcosystemDef {
  name: string;
  github_orgs: string[];
  github_repos: string[]; // additional specific repos
  npm_packages: string[];
  agorion_keywords: string[];
}

const ECOSYSTEMS: EcosystemDef[] = [
  {
    name: 'Zora',
    github_orgs: ['ourzora'],
    github_repos: [],
    npm_packages: ['@zoralabs/protocol-sdk', '@zoralabs/zora-721-contracts', '@zoralabs/coins-sdk'],
    agorion_keywords: ['zora'],
  },
  {
    name: 'Hyperliquid',
    github_orgs: ['hyperliquid-dex'],
    github_repos: [],
    npm_packages: ['hyperliquid', '@nktkas/hyperliquid'],
    agorion_keywords: ['hyperliquid'],
  },
  {
    name: 'Base',
    github_orgs: ['base-org'],
    github_repos: ['coinbase/onchainkit', 'coinbase/x402'],
    npm_packages: ['@coinbase/onchainkit', '@coinbase/coinbase-sdk', '@x402/client'],
    agorion_keywords: ['base', 'coinbase', 'onchainkit'],
  },
  {
    name: 'Solana',
    github_orgs: ['solana-labs', 'solana-foundation'],
    github_repos: ['coral-xyz/anchor', 'jup-ag/jupiter-core'],
    npm_packages: ['@solana/web3.js', '@solana/spl-token', '@coral-xyz/anchor', '@metaplex-foundation/js'],
    agorion_keywords: ['solana', 'spl-token', 'anchor'],
  },
  {
    name: 'Ethereum L1',
    github_orgs: ['ethereum'],
    github_repos: ['foundry-rs/foundry', 'OpenZeppelin/openzeppelin-contracts'],
    npm_packages: ['ethers', 'viem', 'web3', '@openzeppelin/contracts'],
    agorion_keywords: ['ethereum', 'evm', 'solidity'],
  },
  {
    name: 'Uniswap',
    github_orgs: ['Uniswap'],
    github_repos: [],
    npm_packages: ['@uniswap/sdk-core', '@uniswap/v3-sdk', '@uniswap/v4-sdk'],
    agorion_keywords: ['uniswap'],
  },
  {
    name: 'Aave',
    github_orgs: ['aave'],
    github_repos: [],
    npm_packages: ['@aave/contract-helpers', '@aave/math-utils'],
    agorion_keywords: ['aave'],
  },
  {
    name: 'Pump.fun',
    github_orgs: [],
    github_repos: [],
    npm_packages: ['pumpdotfun-sdk'],
    agorion_keywords: ['pump.fun', 'pumpfun', 'pump'],
  },
];

// ── Fetchers ───────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<globalThis.Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try { return await fetch(url, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

async function fetchGitHubOrg(org: string): Promise<Array<{ name: string; stars: number; forks: number; open_issues: number; pushed_at: string }>> {
  try {
    const headers: Record<string, string> = { 'Accept': 'application/vnd.github+json' };
    if (GH_TOKEN) headers['Authorization'] = `Bearer ${GH_TOKEN}`;

    const res = await fetchWithTimeout(
      `https://api.github.com/orgs/${org}/repos?sort=stars&direction=desc&per_page=30`,
      { headers }
    );
    if (!res.ok) return [];
    const repos = (await res.json()) as Array<{
      full_name: string; stargazers_count: number; forks_count: number;
      open_issues_count: number; pushed_at: string;
    }>;
    return repos.map(r => ({
      name: r.full_name,
      stars: r.stargazers_count,
      forks: r.forks_count,
      open_issues: r.open_issues_count,
      pushed_at: r.pushed_at,
    }));
  } catch {
    return [];
  }
}

async function fetchGitHubRepo(repo: string): Promise<{ name: string; stars: number; forks: number; open_issues: number; pushed_at: string } | null> {
  try {
    const headers: Record<string, string> = { 'Accept': 'application/vnd.github+json' };
    if (GH_TOKEN) headers['Authorization'] = `Bearer ${GH_TOKEN}`;

    const res = await fetchWithTimeout(`https://api.github.com/repos/${repo}`, { headers });
    if (!res.ok) return null;
    const r = (await res.json()) as {
      full_name: string; stargazers_count: number; forks_count: number;
      open_issues_count: number; pushed_at: string;
    };
    return { name: r.full_name, stars: r.stargazers_count, forks: r.forks_count, open_issues: r.open_issues_count, pushed_at: r.pushed_at };
  } catch {
    return null;
  }
}

async function fetchNpmDownloads(pkg: string): Promise<number> {
  try {
    const encoded = encodeURIComponent(pkg);
    const res = await fetchWithTimeout(`https://api.npmjs.org/downloads/point/last-week/${encoded}`);
    if (!res.ok) return 0;
    const data = (await res.json()) as { downloads: number };
    return data.downloads || 0;
  } catch {
    return 0;
  }
}

async function fetchAgorionToolCount(keywords: string[]): Promise<number> {
  try {
    const registryFile = path.join(DATA_DIR, 'agorion-registry.json');
    if (!fs.existsSync(registryFile)) return 0;
    const registry = JSON.parse(fs.readFileSync(registryFile, 'utf-8'));
    const providers = registry.providers || [];
    let count = 0;
    const kwLower = keywords.map(k => k.toLowerCase());
    for (const p of providers) {
      const text = `${p.name || ''} ${p.description || ''} ${(p.tags || []).join(' ')}`.toLowerCase();
      if (kwLower.some(kw => text.includes(kw))) count++;
    }
    return count;
  } catch {
    return 0;
  }
}

// ── Scoring ────────────────────────────────────────────────────────────

function computeScore(raw: EcosystemSignal['raw']): { score: number; components: EcosystemSignal['components'] } {
  // GitHub velocity: based on recent commits + stars + forks
  const githubVelocity = Math.min(100, Math.round(
    (Math.min(raw.github_recent_commits, 50) / 50) * 40 +
    (Math.min(raw.github_stars, 5000) / 5000) * 30 +
    (Math.min(raw.github_forks, 2000) / 2000) * 30
  ));

  // Package adoption: based on npm weekly downloads (log scale)
  const packageAdoption = raw.npm_weekly_downloads > 0
    ? Math.min(100, Math.round(Math.log10(raw.npm_weekly_downloads) * 20))
    : 0;

  // Tooling growth: MCP tool count
  const toolingGrowth = Math.min(100, raw.mcp_tool_count * 10);

  // Community size: contributors + open issues
  const communitySize = Math.min(100, Math.round(
    (Math.min(raw.github_contributors, 200) / 200) * 50 +
    (Math.min(raw.github_open_issues, 500) / 500) * 50
  ));

  const score = Math.round(
    githubVelocity * 0.35 +
    packageAdoption * 0.30 +
    toolingGrowth * 0.15 +
    communitySize * 0.20
  );

  return { score, components: { github_velocity: githubVelocity, package_adoption: packageAdoption, tooling_growth: toolingGrowth, community_size: communitySize } };
}

function determineTrend(score: number): EcosystemSignal['trend'] {
  if (score >= 80) return 'surging';
  if (score >= 60) return 'growing';
  if (score >= 35) return 'stable';
  if (score >= 15) return 'declining';
  return 'dormant';
}

// ── Historical comparison ──────────────────────────────────────────────

function getPriorScore(ecosystem: string): number | null {
  try {
    if (!fs.existsSync(NETWORK_INTEL_LOG)) return null;
    const lines = fs.readFileSync(NETWORK_INTEL_LOG, 'utf-8').trim().split('\n');
    // Look at entries from ~7 days ago
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(lines[i]);
        const entryTime = new Date(entry.timestamp).getTime();
        if (entryTime < weekAgo) {
          const eco = entry.ecosystems?.find((e: { ecosystem: string }) => e.ecosystem === ecosystem);
          if (eco) return eco.score;
          break;
        }
      } catch { continue; }
    }
    return null;
  } catch {
    return null;
  }
}

// ── Main Builder ───────────────────────────────────────────────────────

async function buildEcosystemSignal(def: EcosystemDef): Promise<EcosystemSignal> {
  // Fetch GitHub data (orgs + specific repos in parallel)
  const orgPromises = def.github_orgs.map(org => fetchGitHubOrg(org));
  const repoPromises = def.github_repos.map(repo => fetchGitHubRepo(repo));
  const [orgResults, repoResults] = await Promise.all([
    Promise.all(orgPromises),
    Promise.all(repoPromises),
  ]);

  const allRepos = [...orgResults.flat(), ...repoResults.filter((r): r is NonNullable<typeof r> => r !== null)];

  // Fetch npm downloads in parallel
  const npmResults = await Promise.all(def.npm_packages.map(async pkg => ({
    name: pkg,
    weekly_downloads: await fetchNpmDownloads(pkg),
  })));

  // Fetch Agorion tool count
  const mcpToolCount = await fetchAgorionToolCount(def.agorion_keywords);

  // Aggregate GitHub stats
  const totalStars = allRepos.reduce((sum, r) => sum + r.stars, 0);
  const totalForks = allRepos.reduce((sum, r) => sum + r.forks, 0);
  const totalIssues = allRepos.reduce((sum, r) => sum + r.open_issues, 0);

  // Count "recently active" repos (pushed in last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const recentCommits = allRepos.filter(r => r.pushed_at > thirtyDaysAgo).length;

  // Estimate contributors from forks (rough proxy without per-repo API calls)
  const estimatedContributors = Math.min(allRepos.length * 5, totalForks);

  const totalNpmDownloads = npmResults.reduce((sum, r) => sum + r.weekly_downloads, 0);

  const raw: EcosystemSignal['raw'] = {
    github_stars: totalStars,
    github_forks: totalForks,
    github_recent_commits: recentCommits,
    github_open_issues: totalIssues,
    github_contributors: estimatedContributors,
    npm_weekly_downloads: totalNpmDownloads,
    mcp_tool_count: mcpToolCount,
  };

  const { score, components } = computeScore(raw);
  const trend = determineTrend(score);

  // Momentum vs last week
  const priorScore = getPriorScore(def.name);
  const momentum7d = priorScore !== null ? ((score - priorScore) / Math.max(priorScore, 1)) * 100 : 0;

  const topRepos = allRepos
    .sort((a, b) => b.stars - a.stars)
    .slice(0, 3)
    .map(r => ({ name: r.name, stars: r.stars, forks: r.forks, last_push: r.pushed_at }));

  const topPackages = npmResults
    .sort((a, b) => b.weekly_downloads - a.weekly_downloads)
    .slice(0, 3);

  return {
    ecosystem: def.name,
    score,
    trend,
    momentum_7d: Math.round(momentum7d * 10) / 10,
    components,
    raw,
    top_repos: topRepos,
    top_packages: topPackages,
  };
}

export async function buildNetworkIntelligenceReport(): Promise<NetworkIntelligenceReport> {
  const start = Date.now();
  let sourcesOk = 0;

  // Build all ecosystem signals in parallel (but rate-limit GitHub)
  // Process 2 ecosystems at a time to avoid GitHub rate limits
  const signals: EcosystemSignal[] = [];
  for (let i = 0; i < ECOSYSTEMS.length; i += 2) {
    const batch = ECOSYSTEMS.slice(i, i + 2);
    const results = await Promise.all(batch.map(def => buildEcosystemSignal(def)));
    signals.push(...results);
  }

  sourcesOk = signals.filter(s => s.raw.github_stars > 0 || s.raw.npm_weekly_downloads > 0).length;

  // Rank by score
  signals.sort((a, b) => b.score - a.score);
  const rankings = signals.map(s => ({ ecosystem: s.ecosystem, score: s.score, trend: s.trend }));

  // Find biggest mover
  const movers = signals.filter(s => s.momentum_7d !== 0).sort((a, b) => Math.abs(b.momentum_7d) - Math.abs(a.momentum_7d));
  const biggestMover = movers[0]?.ecosystem || signals[0]?.ecosystem || 'unknown';

  const report: NetworkIntelligenceReport = {
    timestamp: new Date().toISOString(),
    ecosystems: signals,
    rankings,
    hottest: signals[0]?.ecosystem || 'unknown',
    biggest_mover: biggestMover,
    metadata: {
      sources_queried: ECOSYSTEMS.length * 3, // github + npm + agorion per ecosystem
      sources_ok: sourcesOk,
      latency_ms: Date.now() - start,
    },
  };

  // Log to JSONL
  try {
    const logEntry = {
      timestamp: report.timestamp,
      ecosystems: signals.map(s => ({ ecosystem: s.ecosystem, score: s.score, trend: s.trend, momentum_7d: s.momentum_7d })),
      hottest: report.hottest,
      biggest_mover: report.biggest_mover,
    };
    fs.appendFileSync(NETWORK_INTEL_LOG, JSON.stringify(logEntry) + '\n');
  } catch { /* non-fatal */ }

  return report;
}

export async function getCachedNetworkIntelligence(): Promise<NetworkIntelligenceReport> {
  const now = Date.now();
  if (cache.data && now < cache.expiresAt) {
    return JSON.parse(JSON.stringify(cache.data));
  }
  const report = await buildNetworkIntelligenceReport();
  cache = { data: report, expiresAt: now + CACHE_TTL_MS };
  return JSON.parse(JSON.stringify(report));
}

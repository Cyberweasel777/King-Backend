import logger from '../../config/logger';
import { getAll, saveRegistry, upsert } from './registry';

export interface AgorionProvider {
  id: string;
  name: string;
  url: string;
  description: string;
  capabilities: string[];
  pricingModel: 'free' | 'x402' | 'api_key' | 'subscription' | 'unknown';
  transport: 'rest' | 'mcp' | 'grpc' | 'unknown';
  lastCrawled: string;
  lastHealthy: string | null;
  responseTimeMs: number | null;
  healthScore: number;
  source: 'npm' | 'github' | 'smithery' | 'glama' | 'mcp.so' | 'pypi' | 'manual';
  manifestUrl: string | null;
  openapiUrl: string | null;
  endpoints: Array<{ path: string; method: string; description: string }>;
}

export type ProviderCandidate = {
  id: string;
  name: string;
  url: string;
  description: string;
  capabilities: string[];
  source: AgorionProvider['source'];
  transport?: AgorionProvider['transport'];
  pricingModel?: AgorionProvider['pricingModel'];
};

type ProbeResult = {
  url: string;
  manifestUrl: string | null;
  openapiUrl: string | null;
  capabilities: string[];
  pricingModel: AgorionProvider['pricingModel'];
  transport: AgorionProvider['transport'];
  name: string | null;
  description: string;
  endpoints: Array<{ path: string; method: string; description: string }>;
  responseTimeMs: number | null;
  healthy: boolean;
};

const DOMAIN_MIN_INTERVAL_MS = 500;
const PYPI_MIN_INTERVAL_MS = 1_000;
const PROBE_TIMEOUT_MS = 10_000;
const REQUEST_TIMEOUT_MS = 10_000;
const PROBE_CONCURRENCY = 8;
const BOTINDEX_COMPLIANCE_CAPABILITIES = [
  'compliance',
  'osint',
  'regulatory',
  'threat-intelligence',
  'defi-compliance',
  'crypto-regulation',
  'mcp',
] as const;
const BOTINDEX_COMPLIANCE_ENDPOINTS: Array<{ path: string; method: string; description: string }> = [
  {
    path: '/api/botindex/compliance/overview',
    method: 'GET',
    description: 'Lightweight compliance snapshot for MCP and agent discovery.',
  },
  {
    path: '/api/botindex/compliance/signal-desk',
    method: 'GET',
    description: 'Compliance signal desk with verdict-style analysis.',
  },
  {
    path: '/api/botindex/compliance/threat-radar',
    method: 'GET',
    description: 'Regulatory threat intelligence radar with jurisdiction risk scoring.',
  },
  {
    path: '/api/botindex/compliance/exposure',
    method: 'GET',
    description: 'Project-level regulatory exposure scan.',
  },
  {
    path: '/api/botindex/compliance/headlines',
    method: 'GET',
    description: 'Live compliance headlines feed.',
  },
];

const DEFAULT_HEADERS: Record<string, string> = {
  Accept: 'application/json, text/html;q=0.9, */*;q=0.8',
  'User-Agent': 'king-backend-agorion-crawler/1.0',
};

const domainChains = new Map<string, Promise<void>>();
const domainLastRequestAt = new Map<string, number>();
let crawlInFlight: Promise<AgorionProvider[]> | null = null;
let pypiLastRequestAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'provider';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeWebUrl(input: string | null | undefined): string | null {
  if (!input) return null;

  let candidate = input.trim();
  if (!candidate) return null;

  if (candidate.startsWith('git+')) {
    candidate = candidate.slice(4);
  }

  if (candidate.startsWith('github:')) {
    candidate = `https://github.com/${candidate.slice('github:'.length)}`;
  }

  if (/^git@github\.com:/i.test(candidate)) {
    candidate = `https://github.com/${candidate.replace(/^git@github\.com:/i, '')}`;
  }

  if (!/^https?:\/\//i.test(candidate)) {
    if (/^[a-z0-9.-]+\.[a-z]{2,}/i.test(candidate)) {
      candidate = `https://${candidate}`;
    } else {
      return null;
    }
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    parsed.hash = '';
    parsed.search = '';
    if (parsed.pathname.endsWith('.git')) {
      parsed.pathname = parsed.pathname.slice(0, -4);
    }

    const normalized = parsed.toString().replace(/\/+$/, '');
    return normalized;
  } catch {
    return null;
  }
}

function getDomain(requestUrl: string): string {
  try {
    return new URL(requestUrl).hostname.toLowerCase();
  } catch {
    return 'invalid-domain';
  }
}

function headersToRecord(headers: RequestInit['headers'] | undefined): Record<string, string> {
  if (!headers) return {};

  if (headers instanceof Headers) {
    const mapped: Record<string, string> = {};
    headers.forEach((value, key) => {
      mapped[key] = value;
    });
    return mapped;
  }

  if (Array.isArray(headers)) {
    return headers.reduce<Record<string, string>>((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {});
  }

  const mapped: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'string') {
      mapped[key] = value;
      continue;
    }

    if (Array.isArray(value)) {
      mapped[key] = value.join(', ');
    }
  }
  return mapped;
}

async function withDomainRateLimit<T>(requestUrl: string, task: () => Promise<T>): Promise<T> {
  const domain = getDomain(requestUrl);
  const chain = domainChains.get(domain) || Promise.resolve();

  const nextTask = chain
    .catch(() => undefined)
    .then(async () => {
      const lastAt = domainLastRequestAt.get(domain) || 0;
      const elapsed = Date.now() - lastAt;
      const waitMs = Math.max(0, DOMAIN_MIN_INTERVAL_MS - elapsed);
      if (waitMs > 0) {
        await sleep(waitMs);
      }

      domainLastRequestAt.set(domain, Date.now());
      return task();
    });

  domainChains.set(
    domain,
    nextTask.then(
      () => undefined,
      () => undefined,
    ),
  );

  return nextTask;
}

async function fetchWithRateLimit(
  requestUrl: string,
  init: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  return withDomainRateLimit(requestUrl, async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(requestUrl, {
        ...init,
        headers: {
          ...DEFAULT_HEADERS,
          ...headersToRecord(init.headers),
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  });
}

async function fetchPyPIWithRateLimit(
  requestUrl: string,
  init: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const elapsed = Date.now() - pypiLastRequestAt;
  const waitMs = Math.max(0, PYPI_MIN_INTERVAL_MS - elapsed);
  if (waitMs > 0) {
    await sleep(waitMs);
  }
  pypiLastRequestAt = Date.now();
  return fetchWithRateLimit(requestUrl, init, timeoutMs);
}

function parseJsonSafely(input: string): unknown {
  try {
    return JSON.parse(input) as unknown;
  } catch {
    return null;
  }
}

function ensureArrayOfStrings(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.map((item) => (typeof item === 'string' ? item.trim().toLowerCase() : '')).filter(Boolean);
}

function extractTextBlob(payload: unknown): string {
  if (typeof payload === 'string') return payload;
  if (!isRecord(payload)) return '';

  const fragments: string[] = [];
  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === 'string') {
      fragments.push(`${key}:${value}`);
      continue;
    }
    if (Array.isArray(value)) {
      fragments.push(`${key}:${value.map((item) => (typeof item === 'string' ? item : '')).filter(Boolean).join(' ')}`);
      continue;
    }
    if (isRecord(value)) {
      fragments.push(extractTextBlob(value));
    }
  }

  return fragments.join(' ');
}

function inferPricingModel(text: string): AgorionProvider['pricingModel'] {
  const lower = text.toLowerCase();
  if (lower.includes('x402')) return 'x402';
  if (lower.includes('api key') || lower.includes('apikey') || lower.includes('api_key')) return 'api_key';
  if (lower.includes('subscription') || lower.includes('/mo') || lower.includes('monthly')) return 'subscription';
  if (lower.includes('free')) return 'free';
  return 'unknown';
}

function inferTransport(text: string, hasOpenApi: boolean): AgorionProvider['transport'] {
  const lower = text.toLowerCase();
  if (lower.includes('mcp')) return 'mcp';
  if (lower.includes('grpc')) return 'grpc';
  if (hasOpenApi || lower.includes('openapi') || lower.includes('rest')) return 'rest';
  return 'unknown';
}

function sanitizeCapability(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function inferCapabilitiesFromText(text: string): string[] {
  const lower = text.toLowerCase();
  const tags = [
    'mcp',
    'x402',
    'market-data',
    'whale-alerts',
    'sports',
    'crypto',
    'commerce',
    'payments',
    'openapi',
    'agent-services',
  ];

  const matches = tags.filter((tag) => lower.includes(tag.replace(/-/g, ' ')) || lower.includes(tag));
  return Array.from(new Set(matches.map(sanitizeCapability).filter(Boolean)));
}

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

function parseOpenApiEndpoints(payload: unknown): Array<{ path: string; method: string; description: string }> {
  if (!isRecord(payload)) return [];
  const paths = payload.paths;
  if (!isRecord(paths)) return [];

  const endpoints: Array<{ path: string; method: string; description: string }> = [];

  for (const [endpointPath, methodMap] of Object.entries(paths)) {
    if (!isRecord(methodMap)) continue;

    for (const method of HTTP_METHODS) {
      const details = methodMap[method];
      if (!isRecord(details)) continue;
      const description = asString(details.summary) || asString(details.description) || '';
      endpoints.push({
        path: endpointPath,
        method: method.toUpperCase(),
        description,
      });
    }
  }

  return endpoints;
}

function parseAiPluginEndpoints(payload: unknown): Array<{ path: string; method: string; description: string }> {
  if (!isRecord(payload)) return [];
  const endpoints: Array<{ path: string; method: string; description: string }> = [];

  const appendFromUnknown = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (!isRecord(item)) continue;
        const pathValue = asString(item.path) || asString(item.url);
        if (!pathValue) continue;
        const method = (asString(item.method) || 'GET').toUpperCase();
        const description = asString(item.description) || '';
        endpoints.push({ path: pathValue, method, description });
      }
      return;
    }

    if (!isRecord(value)) return;

    for (const nested of Object.values(value)) {
      appendFromUnknown(nested);
    }
  };

  appendFromUnknown(payload.endpoints);
  return endpoints;
}

function collectObjectNodes(root: unknown, maxDepth = 4, depth = 0): Record<string, unknown>[] {
  if (depth > maxDepth || !root) return [];

  if (Array.isArray(root)) {
    return root.flatMap((item) => collectObjectNodes(item, maxDepth, depth + 1));
  }

  if (!isRecord(root)) {
    return [];
  }

  const nodes: Record<string, unknown>[] = [root];
  for (const value of Object.values(root)) {
    if (typeof value === 'object' && value !== null) {
      nodes.push(...collectObjectNodes(value, maxDepth, depth + 1));
    }
  }

  return nodes;
}

function resolveRelativeUrl(baseUrl: string, target: string): string | null {
  try {
    const resolved = new URL(target, baseUrl);
    return normalizeWebUrl(resolved.toString());
  } catch {
    return null;
  }
}

function parseHtmlLinks(html: string, baseUrl: string): Array<{ name: string; url: string }> {
  const links: Array<{ name: string; url: string }> = [];
  const anchorRegex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchorRegex)) {
    const hrefRaw = match[1] || '';
    if (!hrefRaw || hrefRaw.startsWith('#') || hrefRaw.startsWith('javascript:') || hrefRaw.startsWith('mailto:')) {
      continue;
    }

    const url = resolveRelativeUrl(baseUrl, hrefRaw);
    if (!url) continue;

    const text = (match[2] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const name = text || new URL(url).hostname;

    links.push({ name, url });
  }

  return links;
}

function dedupeCapabilities(capabilities: string[]): string[] {
  return Array.from(new Set(capabilities.map(sanitizeCapability).filter(Boolean)));
}

function buildGitHubHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

function parsePyPiPackageNamesFromSearchHtml(html: string): string[] {
  const names = new Set<string>();
  const regex = /href=["']\/project\/([^/"'?#]+)\/["']/gi;

  for (const match of html.matchAll(regex)) {
    const pkgName = decodeURIComponent(match[1] || '').trim();
    if (!pkgName) continue;
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(pkgName)) continue;
    names.add(pkgName);
  }

  return Array.from(names);
}

function buildCandidate(base: Partial<ProviderCandidate> & { source: AgorionProvider['source'] }): ProviderCandidate | null {
  const url = normalizeWebUrl(base.url || null);
  if (!url) return null;

  const name = (base.name || '').trim() || new URL(url).hostname;
  const id = slugify(base.id || name);
  const description = (base.description || '').trim();
  const capabilities = dedupeCapabilities(base.capabilities || []);

  return {
    id,
    name,
    url,
    description,
    capabilities,
    source: base.source,
    transport: base.transport,
    pricingModel: base.pricingModel,
  };
}

function dedupeCandidates(candidates: ProviderCandidate[]): ProviderCandidate[] {
  const byKey = new Map<string, ProviderCandidate>();

  for (const candidate of candidates) {
    const key = normalizeWebUrl(candidate.url) || candidate.id;
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, candidate);
      continue;
    }

    const existingWeight = existing.capabilities.length + existing.description.length;
    const candidateWeight = candidate.capabilities.length + candidate.description.length;

    if (candidateWeight > existingWeight) {
      byKey.set(key, candidate);
    }
  }

  return Array.from(byKey.values());
}

function toProbeUrls(baseUrl: string): string[] {
  const normalized = normalizeWebUrl(baseUrl);
  if (!normalized) return [];

  const root = normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
  return [
    `${root}/.well-known/agent-services.json`,
    `${root}/openapi.json`,
    `${root}/api/docs`,
    `${root}/.well-known/ai-plugin.json`,
  ];
}

function computeHealthyScore(responseTimeMs: number | null): number {
  if (responseTimeMs === null) return 20;

  const latencyPenalty = Math.min(45, Math.floor(responseTimeMs / 200));
  return Math.max(55, 100 - latencyPenalty);
}

async function mapWithConcurrency<T, U>(items: T[], concurrency: number, mapper: (item: T) => Promise<U>): Promise<U[]> {
  if (items.length === 0) return [];
  const output: U[] = new Array(items.length);
  let index = 0;

  async function worker(): Promise<void> {
    while (true) {
      const current = index;
      index += 1;
      if (current >= items.length) return;
      output[current] = await mapper(items[current]);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return output;
}

function mergePricingModel(
  existing: AgorionProvider | undefined,
  candidate: ProviderCandidate,
  probe: ProbeResult,
): AgorionProvider['pricingModel'] {
  if (probe.pricingModel !== 'unknown') return probe.pricingModel;
  if (candidate.pricingModel && candidate.pricingModel !== 'unknown') return candidate.pricingModel;
  return existing?.pricingModel || 'unknown';
}

function mergeTransport(
  existing: AgorionProvider | undefined,
  candidate: ProviderCandidate,
  probe: ProbeResult,
): AgorionProvider['transport'] {
  if (probe.transport !== 'unknown') return probe.transport;
  if (candidate.transport && candidate.transport !== 'unknown') return candidate.transport;
  return existing?.transport || 'unknown';
}

function selectSource(existing: AgorionProvider | undefined, candidate: ProviderCandidate): AgorionProvider['source'] {
  if (existing?.source === 'manual') return 'manual';
  return candidate.source || existing?.source || 'manual';
}

function mergeCapabilities(existing: AgorionProvider | undefined, candidate: ProviderCandidate, probe: ProbeResult): string[] {
  return dedupeCapabilities([
    ...(existing?.capabilities || []),
    ...candidate.capabilities,
    ...probe.capabilities,
    ...inferCapabilitiesFromText(candidate.description),
    ...inferCapabilitiesFromText(probe.description),
  ]);
}

function extractCandidateFromNode(
  node: Record<string, unknown>,
  source: AgorionProvider['source'],
  baseUrl: string,
): ProviderCandidate | null {
  const name =
    asString(node.name) ||
    asString(node.title) ||
    asString(node.slug) ||
    asString(node.id);

  const possibleUrl =
    asString(node.url) ||
    asString(node.website) ||
    asString(node.homepage) ||
    asString(node.homeUrl) ||
    asString(node.serverUrl) ||
    asString(node.endpoint) ||
    asString(node.repository) ||
    asString(node.repo) ||
    asString(node.github);

  const url = possibleUrl ? resolveRelativeUrl(baseUrl, possibleUrl) : null;
  if (!url) return null;

  const description = asString(node.description) || '';
  const capabilities = ensureArrayOfStrings(node.capabilities);

  return buildCandidate({
    id: asString(node.slug) || asString(node.id) || undefined,
    name: name || undefined,
    url,
    description,
    capabilities,
    source,
  });
}

export async function crawlNpmRegistry(): Promise<ProviderCandidate[]> {
  const searchUrls = [
    'https://registry.npmjs.org/-/v1/search?text=keywords:mcp-server&size=100',
    'https://registry.npmjs.org/-/v1/search?text=keywords:agent-service&size=100',
  ];

  const candidates: ProviderCandidate[] = [];

  for (const searchUrl of searchUrls) {
    try {
      const response = await fetchWithRateLimit(searchUrl, {}, REQUEST_TIMEOUT_MS);
      if (!response.ok) {
        logger.warn({ status: response.status, searchUrl }, 'npm registry request failed');
        continue;
      }

      const payload = await response.json() as {
        objects?: Array<{
          package?: {
            name?: string;
            description?: string;
            keywords?: string[];
            links?: {
              homepage?: string;
              repository?: string;
              npm?: string;
            };
          };
        }>;
      };

      const objects = Array.isArray(payload.objects) ? payload.objects : [];

      for (const entry of objects) {
        const pkg = entry.package;
        if (!pkg || !pkg.name) continue;

        const targetUrl =
          normalizeWebUrl(pkg.links?.homepage) ||
          normalizeWebUrl(pkg.links?.repository) ||
          normalizeWebUrl(pkg.links?.npm);

        if (!targetUrl) continue;

        const keywords = Array.isArray(pkg.keywords) ? pkg.keywords : [];

        const candidate = buildCandidate({
          id: pkg.name,
          name: pkg.name,
          url: targetUrl,
          description: pkg.description || '',
          capabilities: keywords,
          source: 'npm',
          transport: keywords.some((keyword) => keyword.toLowerCase().includes('mcp')) ? 'mcp' : 'unknown',
        });

        if (candidate) {
          candidates.push(candidate);
        }
      }
    } catch (error) {
      logger.warn({ err: error, searchUrl }, 'npm registry crawl request failed');
    }
  }

  return dedupeCandidates(candidates);
}

export async function crawlGitHubSearch(): Promise<ProviderCandidate[]> {
  const headers = buildGitHubHeaders();

  const searchUrls = [
    'https://api.github.com/search/code?q=agent-services.json+in:path&per_page=100',
    'https://api.github.com/search/code?q=x402+in:file&per_page=100',
  ];

  const candidates: ProviderCandidate[] = [];

  for (const searchUrl of searchUrls) {
    try {
      const response = await fetchWithRateLimit(searchUrl, { headers }, REQUEST_TIMEOUT_MS);
      if (!response.ok) {
        const body = await response.text();
        logger.warn(
          { status: response.status, searchUrl, body: body.slice(0, 200) },
          'GitHub search request failed',
        );
        continue;
      }

      const payload = await response.json() as {
        items?: Array<{
          repository?: {
            name?: string;
            full_name?: string;
            html_url?: string;
            description?: string;
          };
        }>;
      };

      const items = Array.isArray(payload.items) ? payload.items : [];
      for (const item of items) {
        const repository = item.repository;
        const repoUrl = normalizeWebUrl(repository?.html_url);
        if (!repository || !repoUrl) continue;

        const candidate = buildCandidate({
          id: repository.full_name || repository.name || repoUrl,
          name: repository.full_name || repository.name || repoUrl,
          url: repoUrl,
          description: repository.description || '',
          capabilities: inferCapabilitiesFromText(repository.description || ''),
          source: 'github',
        });

        if (candidate) {
          candidates.push(candidate);
        }
      }
    } catch (error) {
      logger.warn({ err: error, searchUrl }, 'GitHub crawl request failed');
    }
  }

  return dedupeCandidates(candidates);
}

export async function crawlGitHubRepos(): Promise<ProviderCandidate[]> {
  try {
    const headers = buildGitHubHeaders();
    const queries = [
      'mcp-server in:name language:typescript',
      'mcp-server in:name language:python',
      'mcp in:topics language:typescript stars:>10',
    ];
    const candidates: ProviderCandidate[] = [];

    for (const query of queries) {
      const searchUrl = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=updated&order=desc&per_page=100`;

      try {
        const response = await fetchWithRateLimit(searchUrl, { headers }, REQUEST_TIMEOUT_MS);
        if (!response.ok) {
          const body = await response.text();
          logger.warn(
            { status: response.status, searchUrl, body: body.slice(0, 200) },
            'GitHub repository search request failed',
          );
          continue;
        }

        const payload = await response.json() as {
          items?: Array<{
            name?: string;
            full_name?: string;
            html_url?: string;
            homepage?: string | null;
            description?: string | null;
            topics?: string[];
          }>;
        };

        const items = Array.isArray(payload.items) ? payload.items : [];
        for (const repo of items) {
          const targetUrl = normalizeWebUrl(repo.homepage) || normalizeWebUrl(repo.html_url);
          if (!targetUrl) continue;

          const topics = Array.isArray(repo.topics) ? repo.topics : [];
          const description = repo.description || '';
          const inferred = inferCapabilitiesFromText(`${topics.join(' ')} ${description} ${repo.name || ''}`);
          const transportText = `${repo.name || ''} ${description} ${topics.join(' ')}`.toLowerCase();

          const candidate = buildCandidate({
            id: repo.full_name || repo.name || targetUrl,
            name: repo.full_name || repo.name || targetUrl,
            url: targetUrl,
            description,
            capabilities: [...topics, ...inferred],
            source: 'github',
            transport: transportText.includes('mcp') ? 'mcp' : 'unknown',
          });

          if (candidate) {
            candidates.push(candidate);
          }
        }
      } catch (error) {
        logger.warn({ err: error, query }, 'GitHub repository crawl request failed');
      }
    }

    return dedupeCandidates(candidates);
  } catch (error) {
    logger.warn({ err: error }, 'GitHub repository crawl failed');
    return [];
  }
}

export async function crawlPyPI(): Promise<ProviderCandidate[]> {
  try {
    const packageNames = new Set<string>();
    const searchUrls = [
      'https://pypi.org/search/?q=mcp+server&o=-created',
      'https://pypi.org/search/?q=model+context+protocol&o=-created',
    ];

    for (const searchUrl of searchUrls) {
      try {
        const response = await fetchPyPIWithRateLimit(
          searchUrl,
          { headers: { Accept: 'text/html,application/xhtml+xml' } },
          REQUEST_TIMEOUT_MS,
        );
        if (!response.ok) {
          logger.warn({ status: response.status, searchUrl }, 'PyPI search request failed');
          continue;
        }

        const html = await response.text();
        for (const name of parsePyPiPackageNamesFromSearchHtml(html)) {
          packageNames.add(name);
        }
      } catch (error) {
        logger.warn({ err: error, searchUrl }, 'PyPI search crawl request failed');
      }
    }

    for (const known of ['mcp-server', 'model-context-protocol', 'mcp']) {
      packageNames.add(known);
    }

    const candidates: ProviderCandidate[] = [];
    for (const packageName of Array.from(packageNames).slice(0, 60)) {
      const metadataUrl = `https://pypi.org/pypi/${encodeURIComponent(packageName)}/json`;

      try {
        const response = await fetchPyPIWithRateLimit(metadataUrl, {}, REQUEST_TIMEOUT_MS);
        if (!response.ok) {
          logger.warn({ status: response.status, metadataUrl }, 'PyPI metadata request failed');
          continue;
        }

        const payload = await response.json() as { info?: Record<string, unknown> };
        const info = isRecord(payload.info) ? payload.info : {};

        const projectUrls = isRecord(info.project_urls)
          ? Object.values(info.project_urls)
            .map((value) => asString(value))
            .filter((value): value is string => Boolean(value))
          : [];

        const summary = asString(info.summary) || '';
        const description = asString(info.description) || '';
        const name = asString(info.name) || packageName;
        const keywordsRaw = asString(info.keywords) || '';
        const keywords = keywordsRaw
          .split(/[\s,]+/)
          .map((entry) => entry.trim())
          .filter(Boolean);

        const targetUrl =
          normalizeWebUrl(asString(info.home_page)) ||
          normalizeWebUrl(asString(info.project_url)) ||
          projectUrls
            .map((value) => normalizeWebUrl(value))
            .find((value): value is string => Boolean(value)) ||
          normalizeWebUrl(`https://pypi.org/project/${name}`);

        if (!targetUrl) {
          continue;
        }

        const combinedText = `${name} ${summary} ${description}`;
        const candidate = buildCandidate({
          id: `pypi-${name}`,
          name,
          url: targetUrl,
          description: summary || description.slice(0, 280),
          capabilities: [...keywords, ...inferCapabilitiesFromText(combinedText)],
          source: 'pypi',
          transport: combinedText.toLowerCase().includes('mcp') ? 'mcp' : 'unknown',
        });

        if (candidate) {
          candidates.push(candidate);
        }
      } catch (error) {
        logger.warn({ err: error, packageName }, 'PyPI package metadata crawl failed');
      }
    }

    return dedupeCandidates(candidates);
  } catch (error) {
    logger.warn({ err: error }, 'PyPI crawl failed');
    return [];
  }
}

export async function crawlAwesomeMcpServers(): Promise<ProviderCandidate[]> {
  try {
    const sourceUrl = 'https://raw.githubusercontent.com/punkpeye/awesome-mcp-servers/main/README.md';
    const response = await fetchWithRateLimit(sourceUrl, {}, REQUEST_TIMEOUT_MS);
    if (!response.ok) {
      logger.warn({ status: response.status, sourceUrl }, 'awesome-mcp-servers fetch failed');
      return [];
    }

    const markdown = await response.text();
    const lineRegex = /^\s*[-*]\s+\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)\s*-\s*(.+)$/gim;
    const candidates: ProviderCandidate[] = [];

    for (const match of markdown.matchAll(lineRegex)) {
      const name = (match[1] || '').trim();
      const url = (match[2] || '').trim();
      const description = (match[3] || '')
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1')
        .trim();

      if (!name || !url) continue;

      const combined = `${name} ${description}`;
      const candidate = buildCandidate({
        id: `awesome-${name}`,
        name,
        url,
        description,
        capabilities: inferCapabilitiesFromText(combined),
        source: 'github',
        transport: combined.toLowerCase().includes('mcp') ? 'mcp' : 'unknown',
      });

      if (candidate) {
        candidates.push(candidate);
      }
    }

    return dedupeCandidates(candidates);
  } catch (error) {
    logger.warn({ err: error }, 'awesome-mcp-servers crawl failed');
    return [];
  }
}

export async function crawlDirectories(): Promise<ProviderCandidate[]> {
  const discovered: ProviderCandidate[] = [];

  try {
    const response = await fetchWithRateLimit('https://smithery.ai/api/servers', {}, REQUEST_TIMEOUT_MS);
    if (response.ok) {
      const payload = await response.json();
      const nodes = collectObjectNodes(payload, 5);
      for (const node of nodes) {
        const candidate = extractCandidateFromNode(node, 'smithery', 'https://smithery.ai');
        if (candidate) {
          discovered.push(candidate);
        }
      }
    } else {
      logger.warn({ status: response.status }, 'Smithery crawl returned non-OK status');
    }
  } catch (error) {
    logger.warn({ err: error }, 'Smithery crawl failed');
  }

  const htmlSources: Array<{ source: 'glama' | 'mcp.so'; url: string }> = [
    { source: 'glama', url: 'https://glama.ai/mcp' },
    { source: 'mcp.so', url: 'https://mcp.so' },
  ];

  for (const htmlSource of htmlSources) {
    try {
      const response = await fetchWithRateLimit(htmlSource.url, {}, REQUEST_TIMEOUT_MS);
      if (!response.ok) {
        logger.warn({ source: htmlSource.source, status: response.status }, 'Directory crawl returned non-OK status');
        continue;
      }

      const html = await response.text();
      const links = parseHtmlLinks(html, htmlSource.url);

      for (const link of links.slice(0, 400)) {
        const candidate = buildCandidate({
          id: `${htmlSource.source}-${link.name}`,
          name: link.name,
          url: link.url,
          description: `${htmlSource.source} directory listing`,
          capabilities: [htmlSource.source === 'glama' ? 'mcp' : 'agent-services'],
          source: htmlSource.source,
          transport: htmlSource.source === 'glama' ? 'mcp' : 'unknown',
        });

        if (candidate) {
          discovered.push(candidate);
        }
      }
    } catch (error) {
      logger.warn({ err: error, source: htmlSource.source }, 'Directory crawl failed');
    }
  }

  return dedupeCandidates(discovered);
}

export async function probeProvider(url: string): Promise<ProbeResult> {
  const normalized = normalizeWebUrl(url) || url;
  const startedAt = Date.now();

  const probeUrls = toProbeUrls(normalized);
  let parsedPayload: unknown = null;
  let textPayload = '';
  let successUrl: string | null = null;
  let successfulResponseMs: number | null = null;

  for (const probeUrl of probeUrls) {
    const elapsed = Date.now() - startedAt;
    const remainingMs = PROBE_TIMEOUT_MS - elapsed;
    if (remainingMs <= 0) break;

    try {
      const response = await fetchWithRateLimit(probeUrl, {}, Math.min(remainingMs, REQUEST_TIMEOUT_MS));
      if (!response.ok) continue;

      textPayload = await response.text();
      parsedPayload = parseJsonSafely(textPayload);
      successUrl = probeUrl;
      successfulResponseMs = Date.now() - startedAt;
      break;
    } catch {
      continue;
    }
  }

  if (!successUrl) {
    return {
      url: normalized,
      manifestUrl: null,
      openapiUrl: null,
      capabilities: [],
      pricingModel: 'unknown',
      transport: 'unknown',
      name: null,
      description: '',
      endpoints: [],
      responseTimeMs: null,
      healthy: false,
    };
  }

  const isOpenApi = successUrl.endsWith('/openapi.json');
  const isManifest = successUrl.endsWith('/.well-known/agent-services.json');
  const isAiPlugin = successUrl.endsWith('/.well-known/ai-plugin.json');

  const payloadBlob = `${textPayload} ${extractTextBlob(parsedPayload)}`;

  const declaredCapabilities = isRecord(parsedPayload)
    ? ensureArrayOfStrings((parsedPayload as Record<string, unknown>).capabilities)
    : [];

  const endpointsFromOpenApi = isOpenApi ? parseOpenApiEndpoints(parsedPayload) : [];
  const endpointsFromAiPlugin = isAiPlugin ? parseAiPluginEndpoints(parsedPayload) : [];
  const endpoints = Array.from(
    new Map(
      [...endpointsFromOpenApi, ...endpointsFromAiPlugin]
        .map((endpoint) => [`${endpoint.method}:${endpoint.path}`, endpoint] as const),
    ).values(),
  ).slice(0, 200);

  const endpointCapabilities = endpoints
    .flatMap((endpoint) => endpoint.path.split('/'))
    .map(sanitizeCapability)
    .filter((value) => value.length >= 3);

  const capabilities = dedupeCapabilities([
    ...declaredCapabilities,
    ...inferCapabilitiesFromText(payloadBlob),
    ...endpointCapabilities,
  ]);

  let detectedName: string | null = null;
  let detectedDescription = '';

  if (isRecord(parsedPayload)) {
    detectedName =
      asString(parsedPayload.name) ||
      asString(parsedPayload.name_for_human) ||
      asString(parsedPayload.title) ||
      null;

    detectedDescription =
      asString(parsedPayload.description) ||
      asString(parsedPayload.description_for_human) ||
      asString(parsedPayload.description_for_model) ||
      '';
  }

  return {
    url: normalized,
    manifestUrl: isManifest ? successUrl : null,
    openapiUrl: isOpenApi ? successUrl : null,
    capabilities,
    pricingModel: inferPricingModel(payloadBlob),
    transport: inferTransport(payloadBlob, isOpenApi),
    name: detectedName,
    description: detectedDescription,
    endpoints,
    responseTimeMs: successfulResponseMs,
    healthy: true,
  };
}

function buildSeedCandidates(existingProviders: AgorionProvider[]): ProviderCandidate[] {
  const seeds: ProviderCandidate[] = [];

  for (const provider of existingProviders) {
    const fromExisting = buildCandidate({
      id: provider.id,
      name: provider.name,
      url: provider.url,
      description: provider.description,
      capabilities: provider.capabilities,
      source: provider.source,
      transport: provider.transport,
      pricingModel: provider.pricingModel,
    });

    if (fromExisting) {
      seeds.push(fromExisting);
    }
  }

  const envSeedUrls = (process.env.AGORION_SEED_URLS || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const seedUrl of envSeedUrls) {
    const fromEnv = buildCandidate({
      id: seedUrl,
      name: seedUrl,
      url: seedUrl,
      description: 'configured seed',
      capabilities: [],
      source: 'manual',
    });

    if (fromEnv) {
      seeds.push(fromEnv);
    }
  }

  const baseUrl = normalizeWebUrl(process.env.BASE_URL || process.env.BOTINDEX_URL || '');
  if (baseUrl) {
    const localSeed = buildCandidate({
      id: 'king-backend',
      name: 'King Backend',
      url: baseUrl,
      description: 'seeded local service',
      capabilities: ['agent-services', 'openapi', 'x402'],
      source: 'manual',
      pricingModel: 'x402',
      transport: 'rest',
    });

    if (localSeed) {
      seeds.push(localSeed);
    }

    const complianceSeed = buildCandidate({
      id: 'botindex-compliance',
      name: 'BotIndex Compliance OSINT',
      url: `${baseUrl}/api/botindex/compliance/overview`,
      description: 'BotIndex compliance and OSINT threat intelligence vertical',
      capabilities: [...BOTINDEX_COMPLIANCE_CAPABILITIES],
      source: 'manual',
      pricingModel: 'api_key',
      transport: 'rest',
    });

    if (complianceSeed) {
      seeds.push(complianceSeed);
    }
  }

  return dedupeCandidates(seeds);
}

function getManualSeedEndpoints(seedId: string): Array<{ path: string; method: string; description: string }> {
  if (seedId === 'botindex-compliance') {
    return BOTINDEX_COMPLIANCE_ENDPOINTS;
  }
  return [];
}

async function runDiscoveryPass(): Promise<ProviderCandidate[]> {
  const results = await Promise.allSettled([
    crawlNpmRegistry(),
    crawlGitHubSearch(),
    crawlGitHubRepos(),
    crawlPyPI(),
    crawlAwesomeMcpServers(),
    crawlDirectories(),
  ]);

  const discovered: ProviderCandidate[] = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      discovered.push(...result.value);
      continue;
    }

    logger.warn({ err: result.reason }, 'Agorion discovery source failed; continuing crawl cycle');
  }

  return dedupeCandidates(discovered);
}

async function runCrawlCycleInternal(): Promise<AgorionProvider[]> {
  const existing = await getAll();
  const byId = new Map(existing.map((provider) => [provider.id, provider]));
  const byUrl = new Map(existing.map((provider) => [normalizeWebUrl(provider.url) || provider.url, provider]));

  const seedCandidates = buildSeedCandidates(existing);
  const discovered = await runDiscoveryPass();

  const allCandidates = dedupeCandidates([...seedCandidates, ...discovered]);
  const nowIso = new Date().toISOString();

  logger.info({
    seedCount: seedCandidates.length,
    discoveredCount: discovered.length,
    probeCount: allCandidates.length,
  }, 'Starting Agorion crawl cycle');

  const probedProviders = await mapWithConcurrency(allCandidates, PROBE_CONCURRENCY, async (candidate) => {
    const existingProvider = byId.get(candidate.id) || byUrl.get(candidate.url);

    const probe = await probeProvider(candidate.url);

    const freshHealthScore = computeHealthyScore(probe.responseTimeMs);
    const healthScore = probe.healthy
      ? existingProvider
        ? Math.round((existingProvider.healthScore * 0.7) + (freshHealthScore * 0.3))
        : freshHealthScore
      : existingProvider
        ? Math.max(0, Math.round(existingProvider.healthScore * 0.85))
        : 20;

    const provider: AgorionProvider = {
      id: existingProvider?.id || candidate.id,
      name: probe.name || candidate.name || existingProvider?.name || candidate.url,
      url: candidate.url,
      description: probe.description || candidate.description || existingProvider?.description || '',
      capabilities: mergeCapabilities(existingProvider, candidate, probe),
      pricingModel: mergePricingModel(existingProvider, candidate, probe),
      transport: mergeTransport(existingProvider, candidate, probe),
      lastCrawled: nowIso,
      lastHealthy: probe.healthy ? nowIso : (existingProvider?.lastHealthy || null),
      responseTimeMs: probe.responseTimeMs,
      healthScore,
      source: selectSource(existingProvider, candidate),
      manifestUrl: probe.manifestUrl || existingProvider?.manifestUrl || null,
      openapiUrl: probe.openapiUrl || existingProvider?.openapiUrl || null,
      endpoints: probe.endpoints.length > 0
        ? probe.endpoints
        : (existingProvider?.endpoints || getManualSeedEndpoints(candidate.id)),
    };

    await upsert(provider);
    return provider;
  });

  await saveRegistry();

  logger.info({
    totalProviders: probedProviders.length,
    healthyProviders: probedProviders.filter((provider) => provider.healthScore > 50).length,
  }, 'Completed Agorion crawl cycle');

  return getAll();
}

export async function runCrawlCycle(): Promise<AgorionProvider[]> {
  if (crawlInFlight) {
    return crawlInFlight;
  }

  crawlInFlight = runCrawlCycleInternal().finally(() => {
    crawlInFlight = null;
  });

  return crawlInFlight;
}

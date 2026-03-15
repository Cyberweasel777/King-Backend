import logger from '../../../config/logger';

const BRAVE_SEARCH_API_URL = 'https://api.search.brave.com/res/v1/web/search';
const CACHE_TTL_MS = 30 * 60 * 1000;
const QUERY_COUNT = 10;
const REQUEST_TIMEOUT_MS = 15_000;

const COMPLIANCE_SEARCH_QUERIES = [
  'prediction market regulation',
  'stablecoin regulation SEC',
  'crypto compliance enforcement',
  'AI agent trading CFTC',
] as const;

const SAMPLE_NOTE = 'Sample headlines only. Set BRAVE_API_KEY for live scanning.';

export interface ComplianceHeadline {
  title: string;
  url: string;
  source: string;
  snippet: string;
  publishedAt: string;
}

interface BraveWebResult {
  title?: string;
  url?: string;
  description?: string;
  age?: string;
  page_age?: string;
  published?: string;
  profile?: {
    name?: string;
  };
  meta_url?: {
    hostname?: string;
  };
}

interface BraveSearchResponse {
  web?: {
    results?: BraveWebResult[];
  };
}

const scannerCache = new Map<string, { data: ComplianceHeadline[]; expiresAt: number }>();

function getSampleHeadlines(): ComplianceHeadline[] {
  const now = new Date().toISOString();
  return [
    {
      title: 'CFTC Signals Tighter Oversight for Event-Contract Prediction Venues',
      url: 'https://example.com/sample/cftc-prediction-oversight',
      source: 'sample_feed',
      snippet: `US derivatives oversight is tightening around prediction-style contracts. ${SAMPLE_NOTE}`,
      publishedAt: now,
    },
    {
      title: 'SEC Staff Commentary Revives Stablecoin Disclosure Debate',
      url: 'https://example.com/sample/sec-stablecoin-disclosure',
      source: 'sample_feed',
      snippet: 'Regulatory focus is shifting toward reserves, redemptions, and issuer transparency.',
      publishedAt: now,
    },
    {
      title: 'EU Policymakers Discuss Cross-Border Rules for Crypto Compliance Tooling',
      url: 'https://example.com/sample/eu-crypto-compliance-tooling',
      source: 'sample_feed',
      snippet: 'New policy language may affect KYC orchestration and monitoring workflows across regions.',
      publishedAt: now,
    },
    {
      title: 'State-Level U.S. Agencies Expand AI Trading Agent Review Programs',
      url: 'https://example.com/sample/us-state-ai-trading-review',
      source: 'sample_feed',
      snippet: 'Automated strategy agents are drawing increased scrutiny around disclosures and consumer harm.',
      publishedAt: now,
    },
    {
      title: 'Banking Watchdogs Highlight DeFi Interface Liability in New Remarks',
      url: 'https://example.com/sample/defi-interface-liability',
      source: 'sample_feed',
      snippet: 'Protocol front-end operators face renewed questions on compliance accountability.',
      publishedAt: now,
    },
  ];
}

function normalizeUrl(raw: string): string {
  try {
    const parsed = new URL(raw);
    parsed.hash = '';
    parsed.searchParams.sort();
    const normalized = parsed.toString();
    return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
  } catch {
    return raw.trim();
  }
}

function parseDate(value: string | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function normalizeSource(result: BraveWebResult, url: string): string {
  if (result.profile?.name && result.profile.name.trim().length > 0) {
    return result.profile.name.trim();
  }

  if (result.meta_url?.hostname && result.meta_url.hostname.trim().length > 0) {
    return result.meta_url.hostname.trim();
  }

  try {
    return new URL(url).hostname;
  } catch {
    return 'unknown';
  }
}

function normalizeHeadline(result: BraveWebResult): ComplianceHeadline | null {
  const title = (result.title || '').trim();
  const rawUrl = (result.url || '').trim();
  if (!title || !rawUrl) return null;

  const normalizedUrl = normalizeUrl(rawUrl);
  const publishedAt = parseDate(result.page_age) || parseDate(result.published) || parseDate(result.age) || new Date().toISOString();

  return {
    title,
    url: normalizedUrl,
    source: normalizeSource(result, normalizedUrl),
    snippet: (result.description || '').trim(),
    publishedAt,
  };
}

async function fetchBraveSearch(query: string, apiKey: string): Promise<ComplianceHeadline[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const url = new URL(BRAVE_SEARCH_API_URL);
    url.searchParams.set('q', query);
    url.searchParams.set('count', String(QUERY_COUNT));

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': apiKey,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Brave HTTP ${response.status}: ${errorText}`);
    }

    const payload = (await response.json()) as BraveSearchResponse;
    const results = payload.web?.results || [];
    return results
      .map(normalizeHeadline)
      .filter((headline): headline is ComplianceHeadline => Boolean(headline));
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function scanComplianceHeadlines(): Promise<ComplianceHeadline[]> {
  const cacheKey = 'compliance:headlines:latest';
  const now = Date.now();
  const cached = scannerCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const braveApiKey = process.env.BRAVE_API_KEY;
  if (!braveApiKey) {
    logger.warn('[compliance.scanner] BRAVE_API_KEY missing, serving sample headlines');
    const sample = getSampleHeadlines();
    scannerCache.set(cacheKey, { data: sample, expiresAt: now + CACHE_TTL_MS });
    return sample;
  }

  try {
    const queryResults = await Promise.all(
      COMPLIANCE_SEARCH_QUERIES.map((query) => fetchBraveSearch(query, braveApiKey))
    );

    const deduped = new Map<string, ComplianceHeadline>();
    for (const batch of queryResults) {
      for (const headline of batch) {
        if (!deduped.has(headline.url)) {
          deduped.set(headline.url, headline);
        }
      }
    }

    const headlines = Array.from(deduped.values())
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
      .slice(0, 30);

    scannerCache.set(cacheKey, { data: headlines, expiresAt: now + CACHE_TTL_MS });
    return headlines;
  } catch (error) {
    logger.error({ err: error }, '[compliance.scanner] live scan failed, serving sample headlines');
    const sample = getSampleHeadlines();
    scannerCache.set(cacheKey, { data: sample, expiresAt: now + CACHE_TTL_MS });
    return sample;
  }
}

export function getComplianceScannerNote(): string | null {
  return process.env.BRAVE_API_KEY ? null : SAMPLE_NOTE;
}

/**
 * Search provider abstraction: Firecrawl (primary) → Brave (fallback).
 * Returns normalized headline-style results from either source.
 */
import logger from '../../../config/logger';

const FIRECRAWL_API_URL = 'https://api.firecrawl.dev/v1/search';
const BRAVE_SEARCH_API_URL = 'https://api.search.brave.com/res/v1/web/search';
const REQUEST_TIMEOUT_MS = 15_000;
const QUERY_COUNT = 10;

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

// ---------- Firecrawl ----------

interface FirecrawlSearchResult {
  title?: string;
  url?: string;
  description?: string;
  markdown?: string;
}

async function searchFirecrawl(query: string, apiKey: string): Promise<SearchResult[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(FIRECRAWL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        limit: QUERY_COUNT,
        scrapeOptions: { formats: ['markdown'], onlyMainContent: true },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Firecrawl HTTP ${response.status}: ${errorText.slice(0, 200)}`);
    }

    const payload = await response.json() as { success?: boolean; data?: FirecrawlSearchResult[] };
    if (!payload.success || !Array.isArray(payload.data)) {
      return [];
    }

    return payload.data
      .filter((r) => r.url && (r.title || r.description))
      .map((r) => ({
        title: r.title || 'Untitled',
        url: r.url!,
        snippet: r.description || r.markdown?.slice(0, 200) || '',
        source: new URL(r.url!).hostname.replace(/^www\./, ''),
      }));
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------- Brave ----------

interface BraveWebResult {
  title?: string;
  url?: string;
  description?: string;
  meta_url?: { hostname?: string };
}

async function searchBrave(query: string, apiKey: string): Promise<SearchResult[]> {
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
      const errorText = await response.text().catch(() => '');
      throw new Error(`Brave HTTP ${response.status}: ${errorText.slice(0, 200)}`);
    }

    const payload = await response.json() as { web?: { results?: BraveWebResult[] } };
    const results = payload.web?.results || [];

    return results
      .filter((r) => r.url && r.title)
      .map((r) => ({
        title: r.title!,
        url: r.url!,
        snippet: r.description || '',
        source: r.meta_url?.hostname?.replace(/^www\./, '') || new URL(r.url!).hostname.replace(/^www\./, ''),
      }));
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------- Unified search ----------

/**
 * Search using Firecrawl (primary), falling back to Brave if Firecrawl fails or is unavailable.
 * Returns normalized SearchResult[].
 */
export async function complianceSearch(query: string): Promise<SearchResult[]> {
  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  const braveKey = process.env.BRAVE_API_KEY;

  // Try Firecrawl first
  if (firecrawlKey) {
    try {
      const results = await searchFirecrawl(query, firecrawlKey);
      if (results.length > 0) {
        return results;
      }
      logger.warn({ query }, '[search-provider] Firecrawl returned 0 results, trying Brave fallback');
    } catch (error) {
      logger.warn({ err: error, query }, '[search-provider] Firecrawl failed, trying Brave fallback');
    }
  }

  // Fallback to Brave
  if (braveKey) {
    try {
      return await searchBrave(query, braveKey);
    } catch (error) {
      logger.warn({ err: error, query }, '[search-provider] Brave fallback also failed');
    }
  }

  // Both unavailable
  if (!firecrawlKey && !braveKey) {
    logger.warn('[search-provider] No search API keys configured (FIRECRAWL_API_KEY or BRAVE_API_KEY)');
  }

  return [];
}

/**
 * Run multiple queries in parallel, deduplicate by URL.
 */
export async function complianceSearchMulti(queries: string[]): Promise<SearchResult[]> {
  const batches = await Promise.all(queries.map((q) => complianceSearch(q)));
  const deduped = new Map<string, SearchResult>();
  for (const batch of batches) {
    for (const result of batch) {
      if (!deduped.has(result.url)) {
        deduped.set(result.url, result);
      }
    }
  }
  return Array.from(deduped.values());
}

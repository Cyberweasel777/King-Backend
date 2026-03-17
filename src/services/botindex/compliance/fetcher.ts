import logger from '../../../config/logger';

export interface ComplianceData {
  enforcementActions: {
    title: string;
    agency: string;
    date: string;
    url: string;
    summary: string;
    tokens_mentioned: string[];
  }[];
  regulatoryUpdates: {
    title: string;
    jurisdiction: string;
    impact: 'positive' | 'negative' | 'neutral';
    url: string;
    summary: string;
  }[];
  sanctionedAddresses: {
    context: string;
    date: string;
    url: string;
  }[];
  fetchedAt: string;
}

type BraveWebResult = {
  title?: string;
  url?: string;
  description?: string;
  age?: string;
  page_age?: string;
  extra_snippets?: string[];
};

type BraveSearchResponse = {
  web?: {
    results?: BraveWebResult[];
  };
};

const BRAVE_SEARCH_URL = 'https://api.search.brave.com/res/v1/web/search';
const BRAVE_REQUEST_TIMEOUT_MS = 12_000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

const ENFORCEMENT_QUERIES = ['SEC crypto enforcement action 2026', 'CFTC crypto enforcement'];
const SANCTIONS_QUERY = 'OFAC crypto sanctions SDN update';
const REGULATORY_QUERY = 'crypto regulation policy 2026';

let cache: { data: ComplianceData; expiresAt: number } | null = null;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function summarize(result: BraveWebResult): string {
  const pieces = [text(result.description)];
  if (Array.isArray(result.extra_snippets)) {
    for (const snippet of result.extra_snippets) {
      pieces.push(text(snippet));
    }
  }
  return compactWhitespace(pieces.filter(Boolean).join(' ')).slice(0, 350);
}

function parseRelativeAge(value: string): string | null {
  const match = value.toLowerCase().match(/(\d+)\s+(minute|hour|day|week|month|year)s?\s+ago/);
  if (!match) return null;

  const count = Number.parseInt(match[1], 10);
  if (!Number.isFinite(count) || count <= 0) return null;

  const unit = match[2];
  const now = new Date();

  const multipliers: Record<string, number> = {
    minute: 60_000,
    hour: 60 * 60_000,
    day: 24 * 60 * 60_000,
    week: 7 * 24 * 60 * 60_000,
    month: 30 * 24 * 60 * 60_000,
    year: 365 * 24 * 60 * 60_000,
  };

  const ms = multipliers[unit];
  if (!ms) return null;

  return new Date(now.getTime() - count * ms).toISOString().slice(0, 10);
}

function normalizeDate(result: BraveWebResult): string {
  const candidates = [text(result.age), text(result.page_age), text(result.description)];

  for (const candidate of candidates) {
    if (!candidate) continue;

    const relative = parseRelativeAge(candidate);
    if (relative) return relative;

    const iso = candidate.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    if (iso) return iso[1];

    const longDate = candidate.match(
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+20\d{2}\b/i
    );
    if (longDate) {
      const parsed = Date.parse(longDate[0]);
      if (!Number.isNaN(parsed)) return new Date(parsed).toISOString().slice(0, 10);
    }
  }

  return new Date().toISOString().slice(0, 10);
}

function inferAgency(input: string): string {
  const t = input.toLowerCase();
  if (t.includes('sec') || t.includes('securities and exchange commission')) return 'SEC';
  if (t.includes('cftc') || t.includes('commodity futures trading commission')) return 'CFTC';
  if (t.includes('doj') || t.includes('department of justice')) return 'DOJ';
  if (t.includes('ofac')) return 'OFAC';
  return 'unknown';
}

function inferJurisdiction(input: string): string {
  const t = input.toLowerCase();
  if (t.includes('united states') || t.includes('u.s.') || t.includes(' us ') || t.includes('sec') || t.includes('cftc')) return 'US';
  if (t.includes('european union') || t.includes('eu') || t.includes('mica')) return 'EU';
  if (t.includes('united kingdom') || t.includes('uk') || t.includes('fca')) return 'UK';
  if (t.includes('singapore') || t.includes('mas')) return 'Singapore';
  if (t.includes('hong kong') || t.includes('hkma') || t.includes('sfc')) return 'Hong Kong';
  if (t.includes('uae') || t.includes('dubai') || t.includes('vara')) return 'UAE';
  return 'global';
}

function inferImpact(input: string): 'positive' | 'negative' | 'neutral' {
  const t = input.toLowerCase();
  const positive = ['approval', 'approved', 'guidance', 'clarity', 'framework', 'license', 'licensed', 'greenlight', 'support'];
  const negative = ['enforcement', 'charge', 'charged', 'lawsuit', 'fine', 'penalty', 'ban', 'banned', 'sanction', 'crackdown', 'restrict'];

  if (negative.some((word) => t.includes(word))) return 'negative';
  if (positive.some((word) => t.includes(word))) return 'positive';
  return 'neutral';
}

function extractTokensMentioned(input: string): string[] {
  const found = new Set<string>();
  const textInput = input.toUpperCase();
  const stopwords = new Set([
    'SEC', 'CFTC', 'DOJ', 'OFAC', 'SDN', 'USA', 'US', 'EU', 'UK', 'ETF', 'AML', 'KYC',
    'THE', 'AND', 'FOR', 'WITH', 'FROM', 'THIS', 'THAT', 'CRYPTO', 'TOKEN', 'COIN',
  ]);

  for (const match of textInput.matchAll(/\$([A-Z0-9]{2,10})\b/g)) {
    const token = match[1];
    if (!stopwords.has(token)) found.add(token);
  }

  for (const match of textInput.matchAll(/\b[A-Z]{2,6}\b/g)) {
    const token = match[0];
    if (!stopwords.has(token)) found.add(token);
  }

  const keywordMap: Record<string, string> = {
    BITCOIN: 'BTC',
    ETHEREUM: 'ETH',
    SOLANA: 'SOL',
    RIPPLE: 'XRP',
    TETHER: 'USDT',
    USDC: 'USDC',
    BINANCE: 'BNB',
  };

  for (const [keyword, ticker] of Object.entries(keywordMap)) {
    if (textInput.includes(keyword)) found.add(ticker);
  }

  return Array.from(found).slice(0, 8);
}

async function braveSearch(query: string, count: number = 10): Promise<BraveWebResult[]> {
  const apiKey = process.env.BRAVE_API_KEY;
  if (!apiKey) {
    throw new Error('BRAVE_API_KEY not set');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BRAVE_REQUEST_TIMEOUT_MS);

  try {
    const url = new URL(BRAVE_SEARCH_URL);
    url.searchParams.set('q', query);
    url.searchParams.set('count', String(count));
    url.searchParams.set('search_lang', 'en');
    url.searchParams.set('country', 'us');
    url.searchParams.set('spellcheck', 'false');

    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': apiKey,
        'User-Agent': 'BotIndex-ComplianceDesk/1.0',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Brave Search ${response.status}: ${body.slice(0, 300)}`);
    }

    const payload = (await response.json()) as BraveSearchResponse;
    const results = payload.web?.results;
    if (!Array.isArray(results)) return [];
    return results;
  } finally {
    clearTimeout(timeout);
  }
}

function dedupeByUrl<T extends { url: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const item of items) {
    const key = item.url.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

function mapEnforcement(results: BraveWebResult[]): ComplianceData['enforcementActions'] {
  const actions = results
    .map((result) => {
      const title = text(result.title);
      const summary = summarize(result);
      const url = text(result.url);
      if (!title || !url) return null;

      const merged = `${title} ${summary}`;
      return {
        title,
        agency: inferAgency(merged),
        date: normalizeDate(result),
        url,
        summary,
        tokens_mentioned: extractTokensMentioned(merged),
      };
    })
    .filter((item): item is ComplianceData['enforcementActions'][number] => Boolean(item));

  return dedupeByUrl(actions).slice(0, 12);
}

function mapSanctions(results: BraveWebResult[]): ComplianceData['sanctionedAddresses'] {
  const items = results
    .map((result) => {
      const title = text(result.title);
      const summary = summarize(result);
      const url = text(result.url);
      if (!url || (!title && !summary)) return null;

      return {
        context: compactWhitespace(`${title}. ${summary}`.trim()).slice(0, 320),
        date: normalizeDate(result),
        url,
      };
    })
    .filter((item): item is ComplianceData['sanctionedAddresses'][number] => Boolean(item));

  return dedupeByUrl(items).slice(0, 10);
}

function mapRegulatory(results: BraveWebResult[]): ComplianceData['regulatoryUpdates'] {
  const updates = results
    .map((result) => {
      const title = text(result.title);
      const summary = summarize(result);
      const url = text(result.url);
      if (!title || !url) return null;

      const merged = `${title} ${summary}`;
      return {
        title,
        jurisdiction: inferJurisdiction(merged),
        impact: inferImpact(merged),
        url,
        summary,
      };
    })
    .filter((item): item is ComplianceData['regulatoryUpdates'][number] => Boolean(item));

  return dedupeByUrl(updates).slice(0, 12);
}

export async function getComplianceData(): Promise<ComplianceData> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return cache.data;
  }

  try {
    const enforcementResponses = await Promise.all(
      ENFORCEMENT_QUERIES.map((query) => braveSearch(query, 8))
    );

    const [sanctionsResults, regulatoryResults] = await Promise.all([
      braveSearch(SANCTIONS_QUERY, 8),
      braveSearch(REGULATORY_QUERY, 10),
    ]);

    const enforcementRaw = enforcementResponses.flat();

    const data: ComplianceData = {
      enforcementActions: mapEnforcement(enforcementRaw),
      regulatoryUpdates: mapRegulatory(regulatoryResults),
      sanctionedAddresses: mapSanctions(sanctionsResults),
      fetchedAt: new Date().toISOString(),
    };

    cache = { data, expiresAt: now + CACHE_TTL_MS };
    return data;
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch compliance data from Brave Search');

    if (cache) {
      return cache.data;
    }

    const fallback: ComplianceData = {
      enforcementActions: [],
      regulatoryUpdates: [],
      sanctionedAddresses: [],
      fetchedAt: new Date().toISOString(),
    };

    cache = { data: fallback, expiresAt: now + 2 * 60 * 1000 };
    return fallback;
  }
}

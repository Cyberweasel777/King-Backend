import logger from '../../../config/logger';
import type { ComplianceHeadline } from './scanner';

const BRAVE_SEARCH_API_URL = 'https://api.search.brave.com/res/v1/web/search';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

const MODEL = 'deepseek-chat';
const TEMPERATURE = 0.2;
const MAX_TOKENS = 4096;
const BRAVE_QUERY_COUNT = 10;
const BRAVE_TIMEOUT_MS = 15_000;
const DEEPSEEK_TIMEOUT_MS = 60_000;
const CACHE_TTL_MS = 30 * 60 * 1000;

const THREAT_QUERIES = [
  'SEC enforcement action crypto 2026',
  'CFTC fine penalty DeFi',
  'crypto exchange shutdown banned',
] as const;

const THREAT_TRENDS = ['escalating', 'stable', 'deescalating'] as const;
type ThreatTrend = typeof THREAT_TRENDS[number];

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

interface DeepSeekResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export interface ThreatRadarEnforcement {
  entity: string;
  agency: string;
  status: string;
  riskToBuilders: string;
}

export interface ThreatRadarJurisdictionRisk {
  US: number;
  EU: number;
  APAC: number;
  LATAM: number;
}

export interface ThreatRadarSafeHarbor {
  jurisdiction: string;
  framework: string;
  opportunity: string;
}

export interface ThreatRadarResult {
  overallThreatLevel: number | null;
  threatTrend: ThreatTrend | null;
  activeEnforcements: ThreatRadarEnforcement[] | null;
  jurisdictionRisk: ThreatRadarJurisdictionRisk | null;
  safeHarbors: ThreatRadarSafeHarbor[] | null;
  builderAdvice: string | null;
  analyzedAt: string;
  degraded: boolean;
  degradedReason: string | null;
}

let threatRadarCache: { data: ThreatRadarResult; expiresAt: number } | null = null;

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
  const title = String(result.title || '').trim();
  const rawUrl = String(result.url || '').trim();
  if (!title || !rawUrl) return null;

  const normalizedUrl = normalizeUrl(rawUrl);
  const publishedAt = parseDate(result.page_age) || parseDate(result.published) || parseDate(result.age) || new Date().toISOString();

  return {
    title,
    url: normalizedUrl,
    source: normalizeSource(result, normalizedUrl),
    snippet: String(result.description || '').trim(),
    publishedAt,
  };
}

function clamp0to100(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function asString(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function parseThreatTrend(value: unknown, fallback: ThreatTrend): ThreatTrend {
  const candidate = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return (THREAT_TRENDS as readonly string[]).includes(candidate) ? (candidate as ThreatTrend) : fallback;
}

function stripMarkdownFences(text: string): string {
  return text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

function parseJsonFromModel<T>(content: string): T | null {
  const candidates: string[] = [];
  const stripped = stripMarkdownFences(content);
  candidates.push(stripped);

  const fencedMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    candidates.push(fencedMatch[1].trim());
  }

  const objectMatch = stripped.match(/\{[\s\S]*\}/);
  if (objectMatch?.[0]) {
    candidates.push(objectMatch[0]);
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // Try next parse candidate.
    }
  }

  return null;
}

function dedupeHeadlinesByUrl(items: ComplianceHeadline[]): ComplianceHeadline[] {
  const byUrl = new Map<string, ComplianceHeadline>();
  for (const item of items) {
    if (!byUrl.has(item.url)) {
      byUrl.set(item.url, item);
    }
  }
  return Array.from(byUrl.values());
}

function isTimeoutError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof Error) {
    if (error.name === 'AbortError') return true;
    return /timeout|timed out|abort/i.test(error.message);
  }
  return false;
}

function buildDegradedThreatRadar(reason: string): ThreatRadarResult {
  return {
    overallThreatLevel: null,
    threatTrend: null,
    activeEnforcements: null,
    jurisdictionRisk: null,
    safeHarbors: null,
    builderAdvice: null,
    analyzedAt: new Date().toISOString(),
    degraded: true,
    degradedReason: reason,
  };
}

async function fetchBraveSearch(query: string, apiKey: string): Promise<ComplianceHeadline[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), BRAVE_TIMEOUT_MS);

  try {
    const url = new URL(BRAVE_SEARCH_API_URL);
    url.searchParams.set('q', query);
    url.searchParams.set('count', String(BRAVE_QUERY_COUNT));

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

function normalizeThreatRadar(raw: unknown): ThreatRadarResult {
  const payload = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;

  const jurisdictionInput = (typeof payload.jurisdictionRisk === 'object' && payload.jurisdictionRisk !== null
    ? payload.jurisdictionRisk
    : {}) as Record<string, unknown>;

  const jurisdictionRisk: ThreatRadarJurisdictionRisk = {
    US: clamp0to100(jurisdictionInput.US, 50),
    EU: clamp0to100(jurisdictionInput.EU, 50),
    APAC: clamp0to100(jurisdictionInput.APAC, 50),
    LATAM: clamp0to100(jurisdictionInput.LATAM, 50),
  };

  const overallThreatLevel = clamp0to100(
    payload.overallThreatLevel,
    Math.round((jurisdictionRisk.US + jurisdictionRisk.EU + jurisdictionRisk.APAC + jurisdictionRisk.LATAM) / 4),
  );

  const activeEnforcements = Array.isArray(payload.activeEnforcements)
    ? payload.activeEnforcements
        .map((item) => (typeof item === 'object' && item !== null ? item : {}))
        .map((item) => {
          const row = item as Record<string, unknown>;
          return {
            entity: asString(row.entity, 'Unknown entity'),
            agency: asString(row.agency, 'Unknown agency'),
            status: asString(row.status, 'active'),
            riskToBuilders: asString(row.riskToBuilders, 'Monitor enforcement exposure before launching in affected market.'),
          };
        })
        .slice(0, 8)
    : [];

  const safeHarbors = Array.isArray(payload.safeHarbors)
    ? payload.safeHarbors
        .map((item) => (typeof item === 'object' && item !== null ? item : {}))
        .map((item) => {
          const row = item as Record<string, unknown>;
          return {
            jurisdiction: asString(row.jurisdiction, 'Unknown jurisdiction'),
            framework: asString(row.framework, 'Emerging framework'),
            opportunity: asString(row.opportunity, 'Assess licensing pathways and compliant launch sequencing.'),
          };
        })
        .slice(0, 8)
    : [];

  const trendFallback: ThreatTrend = overallThreatLevel >= 70 ? 'escalating' : overallThreatLevel <= 35 ? 'deescalating' : 'stable';

  return {
    overallThreatLevel,
    threatTrend: parseThreatTrend(payload.threatTrend, trendFallback),
    activeEnforcements,
    jurisdictionRisk,
    safeHarbors,
    builderAdvice: asString(payload.builderAdvice, 'Prioritize jurisdictional rollout controls and documented compliance operations.'),
    analyzedAt: new Date().toISOString(),
    degraded: false,
    degradedReason: null,
  };
}

async function callDeepSeek(headlines: ComplianceHeadline[]): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY not set');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEEPSEEK_TIMEOUT_MS);

  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: [
              'You are a crypto regulatory threat intelligence analyst for builders and protocol teams.',
              'Return strict JSON only. No markdown.',
              'Output schema exactly:',
              '{"overallThreatLevel":0,"threatTrend":"escalating|stable|deescalating","activeEnforcements":[{"entity":"string","agency":"string","status":"string","riskToBuilders":"string"}],"jurisdictionRisk":{"US":0,"EU":0,"APAC":0,"LATAM":0},"safeHarbors":[{"jurisdiction":"string","framework":"string","opportunity":"string"}],"builderAdvice":"string","analyzedAt":"string"}',
            ].join('\n'),
          },
          {
            role: 'user',
            content: [
              'Use these headlines and infer current regulatory pressure on crypto builders.',
              'Headlines:',
              JSON.stringify(headlines.slice(0, 20)),
            ].join('\n'),
          },
        ],
        temperature: TEMPERATURE,
        max_tokens: MAX_TOKENS,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`DeepSeek ${response.status}: ${text}`);
    }

    const payload = (await response.json()) as DeepSeekResponse;
    const content = payload.choices?.[0]?.message?.content;
    if (!content || !content.trim()) {
      throw new Error('DeepSeek returned empty content');
    }

    return content;
  } finally {
    clearTimeout(timeout);
  }
}

async function generateThreatRadar(): Promise<ThreatRadarResult> {
  const braveApiKey = process.env.BRAVE_API_KEY;
  if (!braveApiKey) {
    logger.warn('[compliance.threat-radar] BRAVE_API_KEY missing, returning degraded payload');
    return buildDegradedThreatRadar('brave_api_key_missing');
  }

  const queryResults = await Promise.all(
    THREAT_QUERIES.map((query) => fetchBraveSearch(query, braveApiKey)),
  );

  const dedupedHeadlines = dedupeHeadlinesByUrl(queryResults.flat())
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, 24);

  if (dedupedHeadlines.length === 0) {
    return {
      overallThreatLevel: 0,
      threatTrend: 'stable',
      activeEnforcements: [],
      jurisdictionRisk: { US: 0, EU: 0, APAC: 0, LATAM: 0 },
      safeHarbors: [],
      builderAdvice: 'No enforcement headlines detected. Continue standard compliance monitoring.',
      analyzedAt: new Date().toISOString(),
      degraded: false,
      degradedReason: null,
    };
  }

  try {
    const content = await callDeepSeek(dedupedHeadlines);
    const parsed = parseJsonFromModel<unknown>(content);
    if (!parsed) {
      throw new Error('Failed to parse DeepSeek JSON response');
    }
    return normalizeThreatRadar(parsed);
  } catch (error) {
    if (isTimeoutError(error)) {
      logger.warn({ err: error }, '[compliance.threat-radar] DeepSeek timeout, returning degraded payload');
      return buildDegradedThreatRadar('deepseek_timeout');
    }

    logger.error({ err: error }, '[compliance.threat-radar] failed');
    throw error;
  }
}

export function getCachedThreatRadar(): ThreatRadarResult | null {
  const now = Date.now();
  if (threatRadarCache && threatRadarCache.expiresAt > now) {
    return threatRadarCache.data;
  }
  return null;
}

export async function getThreatRadar(options: { cacheOnly?: boolean } = {}): Promise<ThreatRadarResult | null> {
  const now = Date.now();
  if (threatRadarCache && threatRadarCache.expiresAt > now) {
    return threatRadarCache.data;
  }

  if (options.cacheOnly) {
    return null;
  }

  const data = await generateThreatRadar();
  threatRadarCache = { data, expiresAt: now + CACHE_TTL_MS };
  return data;
}

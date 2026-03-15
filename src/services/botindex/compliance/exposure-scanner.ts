import logger from '../../../config/logger';

const BRAVE_SEARCH_API_URL = 'https://api.search.brave.com/res/v1/web/search';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const MODEL = 'deepseek-chat';
const TEMPERATURE = 0.2;
const MAX_TOKENS = 4096;

const BRAVE_TIMEOUT_MS = 15_000;
const DEEPSEEK_TIMEOUT_MS = 60_000;
const BRAVE_QUERY_COUNT = 10;
const CACHE_TTL_MS = 60 * 60 * 1000;

const EXPOSURE_LEVELS = ['none', 'low', 'medium', 'high', 'critical'] as const;
export type ExposureLevel = typeof EXPOSURE_LEVELS[number];

interface BraveWebResult {
  title?: string;
  url?: string;
  description?: string;
  age?: string;
  page_age?: string;
  published?: string;
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

interface ExposureHeadline {
  title: string;
  url: string;
  snippet: string;
  publishedAt: string;
}

export interface ExposureAction {
  agency: string;
  type: string;
  date: string;
  summary: string;
}

export interface ExposureSource {
  title: string;
  url: string;
}

export interface ExposureScanResult {
  project: string;
  exposureLevel: ExposureLevel;
  exposureScore: number;
  activeActions: ExposureAction[];
  riskFactors: string[];
  recommendation: string;
  sources: ExposureSource[];
  analyzedAt: string;
  note?: string;
}

const exposureCache = new Map<string, { data: ExposureScanResult; expiresAt: number }>();

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

function normalizeHeadline(result: BraveWebResult): ExposureHeadline | null {
  const title = String(result.title || '').trim();
  const rawUrl = String(result.url || '').trim();
  if (!title || !rawUrl) return null;

  return {
    title,
    url: normalizeUrl(rawUrl),
    snippet: String(result.description || '').trim(),
    publishedAt: parseDate(result.page_age) || parseDate(result.published) || parseDate(result.age) || new Date().toISOString(),
  };
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

function asString(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function clamp0to100(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function parseExposureLevel(value: unknown, fallback: ExposureLevel): ExposureLevel {
  const candidate = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return (EXPOSURE_LEVELS as readonly string[]).includes(candidate) ? (candidate as ExposureLevel) : fallback;
}

function toIsoDate(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed.toISOString();
}

function inferLevelFromScore(score: number): ExposureLevel {
  if (score >= 90) return 'critical';
  if (score >= 75) return 'high';
  if (score >= 45) return 'medium';
  if (score >= 20) return 'low';
  return 'none';
}

function buildCacheKey(project: string): string {
  return project.trim().toLowerCase();
}

function dedupeHeadlines(items: ExposureHeadline[]): ExposureHeadline[] {
  const byUrl = new Map<string, ExposureHeadline>();
  for (const item of items) {
    if (!byUrl.has(item.url)) {
      byUrl.set(item.url, item);
    }
  }
  return Array.from(byUrl.values());
}

function buildSourceList(headlines: ExposureHeadline[]): ExposureSource[] {
  return headlines.slice(0, 12).map((headline) => ({
    title: headline.title,
    url: headline.url,
  }));
}

function buildSampleExposure(project: string): ExposureScanResult {
  const now = new Date().toISOString();
  return {
    project,
    exposureLevel: 'low',
    exposureScore: 28,
    activeActions: [],
    riskFactors: [
      'Live Brave search is unavailable in this environment.',
      'Exposure estimate is sample-only until BRAVE_API_KEY is configured.',
    ],
    recommendation: 'Configure BRAVE_API_KEY to enable live project-level compliance exposure scans.',
    sources: [
      { title: 'Sample: Regulatory exposure monitor', url: 'https://example.com/sample/project-exposure' },
    ],
    analyzedAt: now,
    note: 'Sample response only. Set BRAVE_API_KEY for live exposure intelligence.',
  };
}

function buildHeuristicFallback(project: string, headlines: ExposureHeadline[]): ExposureScanResult {
  const merged = headlines.map((row) => `${row.title} ${row.snippet}`.toLowerCase()).join(' ');
  const hitWords = ['lawsuit', 'enforcement', 'charged', 'fine', 'penalty', 'cease', 'ban', 'shutdown', 'settlement'];
  const hitCount = hitWords.reduce((count, keyword) => count + (merged.includes(keyword) ? 1 : 0), 0);
  const score = Math.max(0, Math.min(100, hitCount * 18));

  return {
    project,
    exposureLevel: inferLevelFromScore(score),
    exposureScore: score,
    activeActions: [],
    riskFactors: hitCount > 0
      ? ['Potential regulatory keywords detected in recent coverage.']
      : ['No obvious regulatory action keywords detected in fetched sources.'],
    recommendation: hitCount > 0
      ? 'Run a manual legal review for current filings and active regulator statements.'
      : 'Maintain monitoring cadence and keep incident response playbooks current.',
    sources: buildSourceList(headlines),
    analyzedAt: new Date().toISOString(),
    note: 'Heuristic fallback used because AI analysis was unavailable.',
  };
}

function normalizeExposureResult(raw: unknown, project: string, sources: ExposureSource[]): ExposureScanResult {
  const payload = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const exposureScore = clamp0to100(payload.exposureScore, 35);
  const inferredLevel = inferLevelFromScore(exposureScore);

  const actions = Array.isArray(payload.activeActions)
    ? payload.activeActions
        .map((item) => (typeof item === 'object' && item !== null ? item : {}))
        .map((item) => {
          const row = item as Record<string, unknown>;
          return {
            agency: asString(row.agency, 'Unknown'),
            type: asString(row.type, 'regulatory_action'),
            date: toIsoDate(row.date, new Date().toISOString()),
            summary: asString(row.summary, 'Regulatory action was referenced but details are incomplete.'),
          };
        })
        .slice(0, 10)
    : [];

  const riskFactors = Array.isArray(payload.riskFactors)
    ? payload.riskFactors
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
        .slice(0, 10)
    : [];

  return {
    project,
    exposureLevel: parseExposureLevel(payload.exposureLevel, inferredLevel),
    exposureScore,
    activeActions: actions,
    riskFactors,
    recommendation: asString(payload.recommendation, 'Monitor for enforcement updates and keep legal review in deployment workflow.'),
    sources,
    analyzedAt: toIsoDate(payload.analyzedAt, new Date().toISOString()),
  };
}

async function fetchBraveSearch(query: string, apiKey: string): Promise<ExposureHeadline[]> {
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
      .filter((headline): headline is ExposureHeadline => Boolean(headline));
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callDeepSeek(project: string, headlines: ExposureHeadline[]): Promise<string> {
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
              'You are a compliance risk analyst for crypto protocols and projects.',
              'Assess whether a project is under active regulatory scrutiny.',
              'Return strict JSON only, with this schema exactly:',
              '{"project":"string","exposureLevel":"none|low|medium|high|critical","exposureScore":0,"activeActions":[{"agency":"string","type":"string","date":"string","summary":"string"}],"riskFactors":["string"],"recommendation":"string","sources":[{"title":"string","url":"string"}],"analyzedAt":"string"}',
            ].join('\n'),
          },
          {
            role: 'user',
            content: [
              `Project: ${project}`,
              'Analyze recent sources below for regulatory exposure.',
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

export async function scanProjectExposure(projectInput: string): Promise<ExposureScanResult> {
  const project = projectInput.trim();
  if (!project) {
    throw new Error('Project name is required');
  }

  const cacheKey = buildCacheKey(project);
  const now = Date.now();
  const cached = exposureCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const braveApiKey = process.env.BRAVE_API_KEY;
  if (!braveApiKey) {
    logger.warn({ project }, '[compliance.exposure-scanner] BRAVE_API_KEY missing, returning sample payload');
    const sample = buildSampleExposure(project);
    exposureCache.set(cacheKey, { data: sample, expiresAt: now + CACHE_TTL_MS });
    return sample;
  }

  const queries = [
    `${project} SEC lawsuit`,
    `${project} regulatory action`,
    `${project} compliance`,
  ];

  try {
    const queryResults = await Promise.all(queries.map((query) => fetchBraveSearch(query, braveApiKey)));
    const dedupedHeadlines = dedupeHeadlines(queryResults.flat())
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
      .slice(0, 20);

    if (dedupedHeadlines.length === 0) {
      const empty: ExposureScanResult = {
        project,
        exposureLevel: 'none',
        exposureScore: 0,
        activeActions: [],
        riskFactors: [],
        recommendation: 'No sources found. Continue monitoring with a wider query scope if needed.',
        sources: [],
        analyzedAt: new Date().toISOString(),
      };
      exposureCache.set(cacheKey, { data: empty, expiresAt: now + CACHE_TTL_MS });
      return empty;
    }

    const sources = buildSourceList(dedupedHeadlines);

    try {
      const content = await callDeepSeek(project, dedupedHeadlines);
      const parsed = parseJsonFromModel<unknown>(content);
      if (!parsed) {
        throw new Error('Failed to parse DeepSeek JSON response');
      }

      const normalized = normalizeExposureResult(parsed, project, sources);
      exposureCache.set(cacheKey, { data: normalized, expiresAt: now + CACHE_TTL_MS });
      return normalized;
    } catch (error) {
      logger.warn({ err: error, project }, '[compliance.exposure-scanner] AI analysis failed, using heuristic fallback');
      const heuristic = buildHeuristicFallback(project, dedupedHeadlines);
      exposureCache.set(cacheKey, { data: heuristic, expiresAt: now + CACHE_TTL_MS });
      return heuristic;
    }
  } catch (error) {
    logger.error({ err: error, project }, '[compliance.exposure-scanner] scan failed');
    const fallback = buildHeuristicFallback(project, []);
    exposureCache.set(cacheKey, { data: fallback, expiresAt: now + 5 * 60 * 1000 });
    return fallback;
  }
}

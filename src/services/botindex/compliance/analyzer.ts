import crypto from 'crypto';
import logger from '../../../config/logger';
import type { ComplianceHeadline } from './scanner';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const MODEL = 'deepseek-chat';
const TEMPERATURE = 0.2;
const MAX_TOKENS = 4096;
const REQUEST_TIMEOUT_MS = 60_000;
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

const RISK_LEVELS = ['low', 'medium', 'high', 'critical'] as const;
const VERDICTS = ['COPY', 'IGNORE', 'COUNTER'] as const;
const SECTORS = [
  'prediction_markets',
  'stablecoins',
  'ai_agents',
  'defi',
  'creator_economy',
  'general_crypto',
] as const;
const TIME_HORIZONS = ['immediate', 'this_week', 'this_month', 'watch'] as const;

const SYSTEM_PROMPT = [
  'You are a compliance intelligence analyst for crypto, DeFi, prediction market, and AI agent product teams.',
  'Evaluate each headline for likely regulatory impact and produce STRICT JSON only (no markdown, no prose outside JSON).',
  'Decision framework:',
  '- COPY: trend to ride; compliant opportunity to build into roadmap now.',
  '- COUNTER: threat to mitigate; enforcement or policy risk requires defensive action.',
  '- IGNORE: low-signal noise; no direct product/compliance action needed now.',
  'Scoring:',
  '- regulatoryRiskScore must be 0-100 where 100 means enforcement action imminent.',
  '- confidence must be 0-100 for your own assessment confidence.',
  'Requirements:',
  '- Include affected jurisdictions (e.g., US, EU, APAC, UK).',
  '- actionItem must be specific and operational (1-2 sentences), not generic.',
  '- reasoning must explain why the verdict follows from headline context (2-3 sentences).',
  '- Keep output schema exact and complete.',
].join('\n');

export type ComplianceVerdict = typeof VERDICTS[number];
export type ComplianceRiskLevel = typeof RISK_LEVELS[number];
export type ComplianceSector = typeof SECTORS[number];
export type ComplianceTimeHorizon = typeof TIME_HORIZONS[number];

export interface ComplianceSignal {
  id: string;
  headline: string;
  url: string;
  source: string;
  publishedAt: string;
  verdict: ComplianceVerdict;
  regulatoryRiskScore: number;
  riskLevel: ComplianceRiskLevel;
  sector: ComplianceSector;
  jurisdictions: string[];
  actionItem: string;
  reasoning: string;
  timeHorizon: ComplianceTimeHorizon;
  confidence: number;
}

export interface ComplianceAnalysis {
  signals: ComplianceSignal[];
  marketBrief: string;
  topAction: string;
  overallRiskLevel: ComplianceRiskLevel;
  analyzedAt: string;
  signalCount: number;
}

interface DeepSeekResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

const analysisCache = new Map<string, { data: ComplianceAnalysis; expiresAt: number }>();

function clamp0to100(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(100, parsed));
}

function toIsoDate(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed.toISOString();
}

function asString(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const clean = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
  return Array.from(new Set(clean));
}

function parseRiskLevel(value: unknown): ComplianceRiskLevel {
  const candidate = typeof value === 'string' ? value.toLowerCase().trim() : '';
  return (RISK_LEVELS as readonly string[]).includes(candidate) ? (candidate as ComplianceRiskLevel) : 'medium';
}

function parseOptionalRiskLevel(value: unknown): ComplianceRiskLevel | null {
  const candidate = typeof value === 'string' ? value.toLowerCase().trim() : '';
  return (RISK_LEVELS as readonly string[]).includes(candidate) ? (candidate as ComplianceRiskLevel) : null;
}

function parseVerdict(value: unknown): ComplianceVerdict {
  const candidate = typeof value === 'string' ? value.toUpperCase().trim() : '';
  return (VERDICTS as readonly string[]).includes(candidate) ? (candidate as ComplianceVerdict) : 'IGNORE';
}

function parseSector(value: unknown): ComplianceSector {
  const candidate = typeof value === 'string' ? value.toLowerCase().trim() : '';
  return (SECTORS as readonly string[]).includes(candidate) ? (candidate as ComplianceSector) : 'general_crypto';
}

function parseTimeHorizon(value: unknown): ComplianceTimeHorizon {
  const candidate = typeof value === 'string' ? value.toLowerCase().trim() : '';
  return (TIME_HORIZONS as readonly string[]).includes(candidate) ? (candidate as ComplianceTimeHorizon) : 'watch';
}

function buildHeadlineMap(headlines: ComplianceHeadline[]): Map<string, ComplianceHeadline> {
  const byUrl = new Map<string, ComplianceHeadline>();
  for (const headline of headlines) {
    byUrl.set(headline.url, headline);
  }
  return byUrl;
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
      // Try next candidate.
    }
  }

  return null;
}

function inferOverallRisk(signals: ComplianceSignal[]): ComplianceRiskLevel {
  const maxScore = signals.reduce((max, signal) => Math.max(max, signal.regulatoryRiskScore), 0);
  if (maxScore >= 85) return 'critical';
  if (maxScore >= 70) return 'high';
  if (maxScore >= 40) return 'medium';
  return 'low';
}

function normalizeSignal(
  row: unknown,
  index: number,
  headlineLookup: Map<string, ComplianceHeadline>,
  fallbackHeadline?: ComplianceHeadline,
): ComplianceSignal {
  const input = (typeof row === 'object' && row !== null ? row : {}) as Record<string, unknown>;
  const fallback = fallbackHeadline || Array.from(headlineLookup.values())[index];
  const matchedByUrl = typeof input.url === 'string' ? headlineLookup.get(input.url) : undefined;
  const sourceRow = matchedByUrl || fallback;
  const nowIso = new Date().toISOString();

  return {
    id: asString(input.id, `signal-${index + 1}`),
    headline: asString(input.headline, sourceRow?.title || `Headline ${index + 1}`),
    url: asString(input.url, sourceRow?.url || ''),
    source: asString(input.source, sourceRow?.source || 'unknown'),
    publishedAt: toIsoDate(input.publishedAt, sourceRow?.publishedAt || nowIso),
    verdict: parseVerdict(input.verdict),
    regulatoryRiskScore: clamp0to100(input.regulatoryRiskScore, 50),
    riskLevel: parseRiskLevel(input.riskLevel),
    sector: parseSector(input.sector),
    jurisdictions: asStringArray(input.jurisdictions),
    actionItem: asString(input.actionItem, 'Monitor developments and update compliance controls as needed.'),
    reasoning: asString(input.reasoning, 'Regulatory signal detected but model reasoning was unavailable.'),
    timeHorizon: parseTimeHorizon(input.timeHorizon),
    confidence: clamp0to100(input.confidence, 50),
  };
}

function normalizeAnalysis(raw: unknown, headlines: ComplianceHeadline[]): ComplianceAnalysis {
  const payload = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const signalRows = Array.isArray(payload.signals) ? payload.signals : [];
  const headlineLookup = buildHeadlineMap(headlines);

  const signals = signalRows.map((row, index) => normalizeSignal(row, index, headlineLookup));
  const normalizedSignals = signals.length > 0
    ? signals
    : headlines.map((headline, index) =>
        normalizeSignal(
          {
            id: `signal-${index + 1}`,
            headline: headline.title,
            url: headline.url,
            source: headline.source,
            publishedAt: headline.publishedAt,
          },
          index,
          headlineLookup,
          headline
        )
      );

  const overallRisk = parseOptionalRiskLevel(payload.overallRiskLevel) || inferOverallRisk(normalizedSignals);
  const signalCountCandidate = Number(payload.signalCount);
  const signalCount = Number.isFinite(signalCountCandidate)
    ? Math.max(0, signalCountCandidate)
    : normalizedSignals.length;

  return {
    signals: normalizedSignals,
    marketBrief: asString(payload.marketBrief, 'Regulatory posture remains active; prioritize policy-aware execution this week.'),
    topAction: asString(payload.topAction, 'Review highest-risk jurisdictions and ship mitigation steps for exposed workflows.'),
    overallRiskLevel: overallRisk,
    analyzedAt: toIsoDate(payload.analyzedAt, new Date().toISOString()),
    signalCount,
  };
}

function buildFallbackAnalysis(headlines: ComplianceHeadline[]): ComplianceAnalysis {
  const now = new Date().toISOString();
  const signals: ComplianceSignal[] = headlines.map((headline, index) => ({
    id: `signal-${index + 1}`,
    headline: headline.title,
    url: headline.url,
    source: headline.source,
    publishedAt: headline.publishedAt,
    verdict: 'IGNORE',
    regulatoryRiskScore: 50,
    riskLevel: 'medium',
    sector: 'general_crypto',
    jurisdictions: ['US'],
    actionItem: 'Queue this item for manual compliance triage and map exposure by product surface.',
    reasoning: 'Automated fallback mode is active because model output was unavailable. Treat this as temporary triage, not final guidance.',
    timeHorizon: 'watch',
    confidence: 35,
  }));

  return {
    signals,
    marketBrief: 'Automated fallback analysis is active. Regulatory conditions should be reviewed manually until model output recovers.',
    topAction: 'Run manual review on the top two headlines and document required mitigations today.',
    overallRiskLevel: inferOverallRisk(signals),
    analyzedAt: now,
    signalCount: signals.length,
  };
}

async function callDeepSeek(headlines: ComplianceHeadline[]): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY not set');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

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
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              'Analyze the following compliance headlines and return JSON exactly matching the requested schema.',
              'Schema:',
              '{"signals":[{"id":"string","headline":"string","url":"string","source":"string","publishedAt":"string","verdict":"COPY|IGNORE|COUNTER","regulatoryRiskScore":0,"riskLevel":"low|medium|high|critical","sector":"prediction_markets|stablecoins|ai_agents|defi|creator_economy|general_crypto","jurisdictions":["US"],"actionItem":"string","reasoning":"string","timeHorizon":"immediate|this_week|this_month|watch","confidence":0}],"marketBrief":"string","topAction":"string","overallRiskLevel":"low|medium|high|critical","analyzedAt":"string","signalCount":0}',
              'Headlines:',
              JSON.stringify(headlines.slice(0, 15)),
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

function buildCacheKey(headlines: ComplianceHeadline[]): string {
  const source = headlines
    .map((headline) => `${headline.url}|${headline.title}|${headline.publishedAt}`)
    .sort()
    .join('||');

  return `compliance:analysis:${crypto.createHash('sha256').update(source).digest('hex')}`;
}

export async function analyzeComplianceHeadlines(headlines: ComplianceHeadline[]): Promise<ComplianceAnalysis> {
  const preparedHeadlines = headlines.slice(0, 15);
  const cacheKey = buildCacheKey(preparedHeadlines);
  const now = Date.now();
  const cached = analysisCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  if (preparedHeadlines.length === 0) {
    const empty: ComplianceAnalysis = {
      signals: [],
      marketBrief: 'No headlines available for analysis.',
      topAction: 'Wait for new headlines, then re-run the signal desk.',
      overallRiskLevel: 'low',
      analyzedAt: new Date().toISOString(),
      signalCount: 0,
    };
    analysisCache.set(cacheKey, { data: empty, expiresAt: now + CACHE_TTL_MS });
    return empty;
  }

  try {
    const content = await callDeepSeek(preparedHeadlines);
    const parsed = parseJsonFromModel<unknown>(content);
    if (!parsed) {
      throw new Error('Failed to parse DeepSeek JSON response');
    }

    const normalized = normalizeAnalysis(parsed, preparedHeadlines);
    analysisCache.set(cacheKey, { data: normalized, expiresAt: now + CACHE_TTL_MS });
    logger.info(
      { signals: normalized.signals.length, overallRiskLevel: normalized.overallRiskLevel },
      '[compliance.analyzer] analysis generated'
    );
    return normalized;
  } catch (error) {
    logger.error({ err: error }, '[compliance.analyzer] analysis failed, returning fallback');
    const fallback = buildFallbackAnalysis(preparedHeadlines);
    analysisCache.set(cacheKey, { data: fallback, expiresAt: now + CACHE_TTL_MS });
    return fallback;
  }
}

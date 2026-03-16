import logger from '../../../config/logger';
import { scanComplianceHeadlines } from '../compliance/scanner';
import { getFundingArbOpportunities } from '../hyperliquid/funding-arb';
import { getHyperliquidWhaleAlerts } from '../hyperliquid/whale-alerts';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const MODEL = 'deepseek-chat';
const TEMPERATURE = 0.3;
const MAX_TOKENS = 4096;
const REQUEST_TIMEOUT_MS = 60_000;
const CACHE_TTL_MS = 20 * 60 * 1000;

const DIRECTIONS = ['BULLISH', 'BEARISH', 'NEUTRAL'] as const;
const CONVERGENCE_STRENGTHS = ['WEAK', 'MODERATE', 'STRONG'] as const;

export type ConvergenceDirection = typeof DIRECTIONS[number];
export type ConvergenceStrength = typeof CONVERGENCE_STRENGTHS[number];

export interface SignalConvergence {
  asset: string;
  signal_count: number;
  signals: string[];
  direction: ConvergenceDirection;
  confidence: number;
  expected_move: string;
  convergence_strength: ConvergenceStrength;
  analyzedAt: string;
}

export interface ConvergenceAnalysis {
  convergences: SignalConvergence[];
  analyzedAt: string;
  degraded: boolean;
}

interface DeepSeekResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

const cache = new Map<string, { data: ConvergenceAnalysis; expiresAt: number }>();

function asString(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function toIsoDate(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed.toISOString();
}

function parseDirection(value: unknown): ConvergenceDirection {
  const candidate = typeof value === 'string' ? value.toUpperCase().trim() : '';
  return (DIRECTIONS as readonly string[]).includes(candidate)
    ? (candidate as ConvergenceDirection)
    : 'NEUTRAL';
}

function deriveStrength(signalCount: number): ConvergenceStrength {
  if (signalCount >= 3) return 'STRONG';
  if (signalCount === 2) return 'MODERATE';
  return 'WEAK';
}

function parseStrength(value: unknown, signalCount: number): ConvergenceStrength {
  const candidate = typeof value === 'string' ? value.toUpperCase().trim() : '';
  return (CONVERGENCE_STRENGTHS as readonly string[]).includes(candidate)
    ? (candidate as ConvergenceStrength)
    : deriveStrength(signalCount);
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

  const arrayMatch = stripped.match(/\[[\s\S]*\]/);
  if (arrayMatch?.[0]) {
    candidates.push(arrayMatch[0]);
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

function normalizeConvergence(value: unknown, index: number): SignalConvergence {
  const input = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  const signals = asStringArray(input.signals);
  const signalCount = Math.round(clamp(input.signal_count, 1, 5, Math.max(1, signals.length)));
  const nowIso = new Date().toISOString();

  return {
    asset: asString(input.asset, `ASSET_${index + 1}`).toUpperCase(),
    signal_count: signalCount,
    signals,
    direction: parseDirection(input.direction),
    confidence: Math.round(clamp(input.confidence, 0, 100, 50)),
    expected_move: asString(input.expected_move, 'Expected move unavailable.'),
    convergence_strength: parseStrength(input.convergence_strength, signalCount),
    analyzedAt: toIsoDate(input.analyzedAt, nowIso),
  };
}

async function callDeepSeek(input: { funding: unknown; whales: unknown; headlines: unknown }): Promise<string> {
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
          {
            role: 'system',
            content: 'You are a cross-signal analyst. Return STRICT JSON only with no markdown.',
          },
          {
            role: 'user',
            content: [
              'You are a cross-signal analyst. Identify assets where multiple independent signals converge (funding rate anomaly + whale activity + regulatory catalyst). For each convergence, rate strength (1-5 signals aligned), direction, confidence, and expected_move. Return JSON array.',
              'Schema:',
              '[{"asset":"ETH","signal_count":3,"signals":["funding_rate_spike","whale_accumulation","regulatory_clearance"],"direction":"BULLISH","confidence":78,"expected_move":"string","convergence_strength":"STRONG","analyzedAt":"ISO-8601"}]',
              'Funding rates data:',
              JSON.stringify(input.funding),
              'Whale alerts data:',
              JSON.stringify(input.whales),
              'Compliance headlines data:',
              JSON.stringify(input.headlines),
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

function normalizeAnalysis(raw: unknown): SignalConvergence[] {
  const rows = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as Record<string, unknown> | null)?.convergences)
      ? (((raw as Record<string, unknown>).convergences as unknown[]) || [])
      : [];

  return rows
    .map((row, index) => normalizeConvergence(row, index))
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 10);
}

function buildFallbackAnalysis(): ConvergenceAnalysis {
  return {
    convergences: [],
    analyzedAt: new Date().toISOString(),
    degraded: true,
  };
}

export async function detectSignalConvergence(): Promise<ConvergenceAnalysis> {
  const cacheKey = 'convergence-detector:latest';
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  try {
    const [funding, whales, headlines] = await Promise.all([
      getFundingArbOpportunities(),
      getHyperliquidWhaleAlerts(),
      scanComplianceHeadlines(),
    ]);

    const content = await callDeepSeek({ funding, whales, headlines });
    const parsed = parseJsonFromModel<unknown>(content);
    if (!parsed) {
      throw new Error('Failed to parse DeepSeek JSON response');
    }

    const convergences = normalizeAnalysis(parsed);
    const analysis: ConvergenceAnalysis = {
      convergences,
      analyzedAt: new Date().toISOString(),
      degraded: false,
    };

    cache.set(cacheKey, { data: analysis, expiresAt: now + CACHE_TTL_MS });
    logger.info({ count: convergences.length }, '[intelligence.convergence-detector] analysis generated');
    return analysis;
  } catch (error) {
    logger.error({ err: error }, '[intelligence.convergence-detector] analysis failed, returning degraded fallback');
    const fallback = buildFallbackAnalysis();
    cache.set(cacheKey, { data: fallback, expiresAt: now + CACHE_TTL_MS });
    return fallback;
  }
}

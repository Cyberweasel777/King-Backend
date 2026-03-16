import logger from '../../../config/logger';
import { getZoraTrendingCoins } from '../zora/trending';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const MODEL = 'deepseek-chat';
const TEMPERATURE = 0.3;
const MAX_TOKENS = 4096;
const REQUEST_TIMEOUT_MS = 60_000;
const CACHE_TTL_MS = 10 * 60 * 1000;

const ENTRY_CONFIDENCE_LEVELS = ['HIGH', 'MEDIUM', 'LOW', 'AVOID'] as const;

export type EntryConfidence = typeof ENTRY_CONFIDENCE_LEVELS[number];

export interface LaunchAlphaSignal {
  token: string;
  attention_momentum: number;
  creator_score: number;
  similar_launches_avg_return: string;
  entry_confidence: EntryConfidence;
  reasoning: string;
  analyzedAt: string;
}

export interface LaunchAlphaAnalysis {
  launches: LaunchAlphaSignal[];
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

const cache = new Map<string, { data: LaunchAlphaAnalysis; expiresAt: number }>();

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

function toIsoDate(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed.toISOString();
}

function parseEntryConfidence(value: unknown): EntryConfidence {
  const candidate = typeof value === 'string' ? value.toUpperCase().trim() : '';
  return (ENTRY_CONFIDENCE_LEVELS as readonly string[]).includes(candidate)
    ? (candidate as EntryConfidence)
    : 'LOW';
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

const ENTRY_CONFIDENCE_RANK: Record<EntryConfidence, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
  AVOID: 3,
};

function normalizeLaunchSignal(value: unknown, index: number): LaunchAlphaSignal {
  const input = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  const nowIso = new Date().toISOString();

  return {
    token: asString(input.token, `token_${index + 1}`),
    attention_momentum: clamp0to100(input.attention_momentum, 50),
    creator_score: clamp0to100(input.creator_score, 50),
    similar_launches_avg_return: asString(input.similar_launches_avg_return, 'Historical baseline unavailable.'),
    entry_confidence: parseEntryConfidence(input.entry_confidence),
    reasoning: asString(input.reasoning, 'Model reasoning unavailable.'),
    analyzedAt: toIsoDate(input.analyzedAt, nowIso),
  };
}

async function callDeepSeek(input: { trendingCoins: unknown }): Promise<string> {
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
            content: 'You are a token launch analyst. Return STRICT JSON only with no markdown.',
          },
          {
            role: 'user',
            content: [
              'You are a token launch analyst. Score each token launch on: attention_momentum (0-100), creator_credibility (0-100), similar_launch_performance, entry_confidence (HIGH/MEDIUM/LOW/AVOID), and one-line reasoning. Return JSON array, sorted by entry_confidence.',
              'Schema:',
              '[{"token":"token_name","attention_momentum":87,"creator_score":92,"similar_launches_avg_return":"3.2x in first 4 hours","entry_confidence":"MEDIUM","reasoning":"string","analyzedAt":"ISO-8601"}]',
              'Trending token data:',
              JSON.stringify(input.trendingCoins),
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

function normalizeAnalysis(raw: unknown): LaunchAlphaSignal[] {
  const rows = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as Record<string, unknown> | null)?.launches)
      ? (((raw as Record<string, unknown>).launches as unknown[]) || [])
      : [];

  return rows
    .map((row, index) => normalizeLaunchSignal(row, index))
    .sort((left, right) => {
      const rankGap = ENTRY_CONFIDENCE_RANK[left.entry_confidence] - ENTRY_CONFIDENCE_RANK[right.entry_confidence];
      if (rankGap !== 0) return rankGap;
      return right.attention_momentum - left.attention_momentum;
    });
}

function buildFallbackAnalysis(): LaunchAlphaAnalysis {
  return {
    launches: [],
    analyzedAt: new Date().toISOString(),
    degraded: true,
  };
}

export async function analyzeLaunchAlpha(): Promise<LaunchAlphaAnalysis> {
  const cacheKey = 'launch-alpha:latest';
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  try {
    const trending = await getZoraTrendingCoins(20);
    const content = await callDeepSeek({ trendingCoins: trending });
    const parsed = parseJsonFromModel<unknown>(content);
    if (!parsed) {
      throw new Error('Failed to parse DeepSeek JSON response');
    }

    const launches = normalizeAnalysis(parsed);
    const analysis: LaunchAlphaAnalysis = {
      launches,
      analyzedAt: new Date().toISOString(),
      degraded: false,
    };

    cache.set(cacheKey, { data: analysis, expiresAt: now + CACHE_TTL_MS });
    logger.info({ count: launches.length }, '[intelligence.launch-alpha] analysis generated');
    return analysis;
  } catch (error) {
    logger.error({ err: error }, '[intelligence.launch-alpha] analysis failed, returning degraded fallback');
    const fallback = buildFallbackAnalysis();
    cache.set(cacheKey, { data: fallback, expiresAt: now + CACHE_TTL_MS });
    return fallback;
  }
}

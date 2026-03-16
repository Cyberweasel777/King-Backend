import logger from '../../../config/logger';
import { getFundingArbOpportunities } from '../hyperliquid/funding-arb';
import { getHyperliquidWhaleAlerts } from '../hyperliquid/whale-alerts';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const MODEL = 'deepseek-chat';
const TEMPERATURE = 0.3;
const MAX_TOKENS = 4096;
const REQUEST_TIMEOUT_MS = 60_000;
const CACHE_TTL_MS = 15 * 60 * 1000;

const SIGNAL_DIRECTIONS = ['LONG', 'SHORT', 'NEUTRAL'] as const;

export type TradeSignalDirection = typeof SIGNAL_DIRECTIONS[number];

export interface TradeSignal {
  asset: string;
  direction: TradeSignalDirection;
  confidence: number;
  timeframe: string;
  reasoning: string;
  historical_context: string;
  sources: string[];
}

export interface TradeSignalsAnalysis {
  signals: TradeSignal[];
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

const cache = new Map<string, { data: TradeSignalsAnalysis; expiresAt: number }>();

function asString(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function asStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const cleaned = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
  return cleaned.length > 0 ? Array.from(new Set(cleaned)) : fallback;
}

function clamp0to100(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function parseDirection(value: unknown): TradeSignalDirection {
  const candidate = typeof value === 'string' ? value.toUpperCase().trim() : '';
  return (SIGNAL_DIRECTIONS as readonly string[]).includes(candidate)
    ? (candidate as TradeSignalDirection)
    : 'NEUTRAL';
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

function normalizeSignal(value: unknown, index: number): TradeSignal {
  const input = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  const fallbackAsset = `ASSET_${index + 1}`;

  return {
    asset: asString(input.asset, fallbackAsset).toUpperCase(),
    direction: parseDirection(input.direction),
    confidence: clamp0to100(input.confidence, 50),
    timeframe: asString(input.timeframe, '24-48h'),
    reasoning: asString(input.reasoning, 'Signal identified, but model reasoning was unavailable.'),
    historical_context: asString(input.historical_context, 'Historical context unavailable.'),
    sources: asStringArray(input.sources, ['hyperliquid_funding', 'whale_positions']),
  };
}

async function callDeepSeek(input: { funding: unknown; whales: unknown }): Promise<string> {
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
            content: 'You are a quantitative trading analyst. Return STRICT JSON only with no markdown.',
          },
          {
            role: 'user',
            content: [
              'You are a quantitative trading analyst. Given these funding rates and whale position data, identify the top 3 actionable trading signals. For each signal, provide: asset, direction (LONG/SHORT/NEUTRAL), confidence (0-100), timeframe, reasoning (2 sentences max), and historical_context (what similar setups produced). Return JSON array.',
              'Schema:',
              '[{"asset":"ETH","direction":"SHORT","confidence":82,"timeframe":"24-48h","reasoning":"string","historical_context":"string","sources":["hyperliquid_funding","whale_positions"]}]',
              'Funding rates data:',
              JSON.stringify(input.funding),
              'Whale alerts data:',
              JSON.stringify(input.whales),
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

function normalizeAnalysis(raw: unknown): TradeSignal[] {
  const rows = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as Record<string, unknown> | null)?.signals)
      ? (((raw as Record<string, unknown>).signals as unknown[]) || [])
      : [];

  return rows.map((row, index) => normalizeSignal(row, index)).slice(0, 3);
}

function buildFallbackAnalysis(): TradeSignalsAnalysis {
  return {
    signals: [],
    analyzedAt: new Date().toISOString(),
    degraded: true,
  };
}

export async function getTradeSignals(): Promise<TradeSignalsAnalysis> {
  const cacheKey = 'trade-signals:latest';
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  try {
    const [funding, whales] = await Promise.all([
      getFundingArbOpportunities(),
      getHyperliquidWhaleAlerts(),
    ]);

    const content = await callDeepSeek({ funding, whales });
    const parsed = parseJsonFromModel<unknown>(content);
    if (!parsed) {
      throw new Error('Failed to parse DeepSeek JSON response');
    }

    const signals = normalizeAnalysis(parsed);
    const analysis: TradeSignalsAnalysis = {
      signals,
      analyzedAt: new Date().toISOString(),
      degraded: false,
    };

    cache.set(cacheKey, { data: analysis, expiresAt: now + CACHE_TTL_MS });
    logger.info({ count: signals.length }, '[intelligence.trade-signals] analysis generated');
    return analysis;
  } catch (error) {
    logger.error({ err: error }, '[intelligence.trade-signals] analysis failed, returning degraded fallback');
    const fallback = buildFallbackAnalysis();
    cache.set(cacheKey, { data: fallback, expiresAt: now + CACHE_TTL_MS });
    return fallback;
  }
}

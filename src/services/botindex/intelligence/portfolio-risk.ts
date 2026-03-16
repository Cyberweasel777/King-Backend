import crypto from 'crypto';
import logger from '../../../config/logger';
import { getHLCorrelationMatrix } from '../hyperliquid/correlation';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const MODEL = 'deepseek-chat';
const TEMPERATURE = 0.3;
const MAX_TOKENS = 4096;
const REQUEST_TIMEOUT_MS = 60_000;
const CACHE_TTL_MS = 30 * 60 * 1000;

const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
const DIRECTIONS = ['long', 'short'] as const;

export type PortfolioDirection = typeof DIRECTIONS[number];
export type PortfolioRiskLevel = typeof RISK_LEVELS[number];

export interface PortfolioPosition {
  asset: string;
  direction: PortfolioDirection;
  size_pct: number;
}

export interface CorrelatedPair {
  assets: [string, string];
  correlation: number;
  risk: string;
}

export interface HedgeRecommendation {
  action: string;
  size: string;
  reasoning: string;
}

export interface PortfolioRiskAnalysis {
  overall_risk_score: number;
  risk_level: PortfolioRiskLevel;
  correlated_pairs: CorrelatedPair[];
  concentration_risk: string;
  max_drawdown_estimate: string;
  hedge_recommendations: HedgeRecommendation[];
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

const cache = new Map<string, { data: PortfolioRiskAnalysis; expiresAt: number }>();

function asString(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function parseRiskLevel(value: unknown): PortfolioRiskLevel {
  const candidate = typeof value === 'string' ? value.toUpperCase().trim() : '';
  return (RISK_LEVELS as readonly string[]).includes(candidate)
    ? (candidate as PortfolioRiskLevel)
    : 'MEDIUM';
}

function toIsoDate(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed.toISOString();
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

function sortPositions(positions: PortfolioPosition[]): PortfolioPosition[] {
  return [...positions].sort((left, right) => {
    const assetCompare = left.asset.localeCompare(right.asset);
    if (assetCompare !== 0) return assetCompare;
    const directionCompare = left.direction.localeCompare(right.direction);
    if (directionCompare !== 0) return directionCompare;
    return left.size_pct - right.size_pct;
  });
}

function buildPositionHash(positions: PortfolioPosition[]): string {
  const canonical = sortPositions(positions).map((position) => ({
    asset: position.asset.toUpperCase(),
    direction: position.direction,
    size_pct: Number(position.size_pct.toFixed(4)),
  }));

  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function normalizeCorrelatedPair(value: unknown): CorrelatedPair | null {
  const input = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  const assetsValue = Array.isArray(input.assets) ? input.assets : [];
  const assets = assetsValue
    .map((item) => (typeof item === 'string' ? item.trim().toUpperCase() : ''))
    .filter((item) => item.length > 0)
    .slice(0, 2);

  if (assets.length < 2) {
    return null;
  }

  return {
    assets: [assets[0], assets[1]],
    correlation: Number(clamp(input.correlation, -1, 1, 0).toFixed(4)),
    risk: asString(input.risk, 'Correlation risk identified.'),
  };
}

function normalizeHedgeRecommendation(value: unknown): HedgeRecommendation | null {
  const input = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  const action = asString(input.action, 'Hedge recommendation unavailable');
  const size = asString(input.size, 'N/A');
  const reasoning = asString(input.reasoning, 'Model did not provide hedge reasoning.');

  if (!action || action === 'Hedge recommendation unavailable') {
    return null;
  }

  return { action, size, reasoning };
}

function inferRiskLevel(score: number): PortfolioRiskLevel {
  if (score >= 85) return 'CRITICAL';
  if (score >= 70) return 'HIGH';
  if (score >= 40) return 'MEDIUM';
  return 'LOW';
}

async function callDeepSeek(input: { positions: PortfolioPosition[]; correlations: unknown }): Promise<string> {
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
            content: 'You are a risk management analyst. Return STRICT JSON only with no markdown.',
          },
          {
            role: 'user',
            content: [
              'You are a risk management analyst. Given this portfolio and correlation matrix, assess: overall_risk_score (0-100), correlated_pairs (which positions move together), concentration_risk, max_drawdown_estimate, and specific hedge_recommendations. Return JSON.',
              'Schema:',
              '{"overall_risk_score":72,"risk_level":"HIGH","correlated_pairs":[{"assets":["BTC","ETH"],"correlation":0.94,"risk":"string"}],"concentration_risk":"string","max_drawdown_estimate":"string","hedge_recommendations":[{"action":"string","size":"string","reasoning":"string"}],"analyzedAt":"ISO-8601"}',
              'Portfolio positions:',
              JSON.stringify(input.positions),
              'Correlation matrix:',
              JSON.stringify(input.correlations),
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

function normalizeAnalysis(raw: unknown): Omit<PortfolioRiskAnalysis, 'degraded'> {
  const payload = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const score = Math.round(clamp(payload.overall_risk_score, 0, 100, 50));
  const correlatedPairs = Array.isArray(payload.correlated_pairs)
    ? payload.correlated_pairs.map(normalizeCorrelatedPair).filter((item): item is CorrelatedPair => Boolean(item))
    : [];
  const hedgeRecommendations = Array.isArray(payload.hedge_recommendations)
    ? payload.hedge_recommendations
        .map(normalizeHedgeRecommendation)
        .filter((item): item is HedgeRecommendation => Boolean(item))
    : [];
  const nowIso = new Date().toISOString();

  return {
    overall_risk_score: score,
    risk_level: parseRiskLevel(payload.risk_level) || inferRiskLevel(score),
    correlated_pairs: correlatedPairs,
    concentration_risk: asString(payload.concentration_risk, 'Concentration risk was not provided by the model.'),
    max_drawdown_estimate: asString(payload.max_drawdown_estimate, 'Max drawdown estimate unavailable.'),
    hedge_recommendations: hedgeRecommendations,
    analyzedAt: toIsoDate(payload.analyzedAt, nowIso),
  };
}

function getPairCorrelation(matrix: Record<string, Record<string, number>>, left: string, right: string): number {
  return matrix[left]?.[right] ?? matrix[right]?.[left] ?? 0;
}

function buildFallbackAnalysis(
  positions: PortfolioPosition[],
  correlationMatrix: Record<string, Record<string, number>>,
): PortfolioRiskAnalysis {
  const totalExposure = positions.reduce((sum, position) => sum + Math.max(0, position.size_pct), 0);
  const largestPosition = positions.reduce((max, position) => Math.max(max, position.size_pct), 0);
  const score = Math.round(Math.max(0, Math.min(100, totalExposure * 0.6 + largestPosition * 0.8)));
  const correlatedPairs: CorrelatedPair[] = [];

  for (let i = 0; i < positions.length; i += 1) {
    for (let j = i + 1; j < positions.length; j += 1) {
      const left = positions[i];
      const right = positions[j];
      const corr = getPairCorrelation(correlationMatrix, left.asset, right.asset);
      if (Math.abs(corr) < 0.75) continue;

      const sameDirection = left.direction === right.direction;
      correlatedPairs.push({
        assets: [left.asset, right.asset],
        correlation: Number(corr.toFixed(4)),
        risk: sameDirection
          ? 'Both positions lean in the same direction with high correlation.'
          : 'Opposing directions with high correlation can create unstable hedging behavior.',
      });
    }
  }

  return {
    overall_risk_score: score,
    risk_level: inferRiskLevel(score),
    correlated_pairs: correlatedPairs,
    concentration_risk: `${Math.round(totalExposure)}% gross exposure across ${positions.length} positions`,
    max_drawdown_estimate: 'Fallback estimate unavailable while model is degraded.',
    hedge_recommendations: [],
    analyzedAt: new Date().toISOString(),
    degraded: true,
  };
}

export async function scanPortfolioRisk(positions: PortfolioPosition[]): Promise<PortfolioRiskAnalysis> {
  const positionHash = buildPositionHash(positions);
  const cacheKey = `portfolio-risk:${positionHash}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const normalizedPositions = positions.map((position) => ({
    asset: position.asset.toUpperCase(),
    direction: position.direction,
    size_pct: Number(position.size_pct.toFixed(4)),
  }));

  try {
    const correlationData = await getHLCorrelationMatrix();
    const content = await callDeepSeek({
      positions: normalizedPositions,
      correlations: correlationData,
    });
    const parsed = parseJsonFromModel<unknown>(content);
    if (!parsed) {
      throw new Error('Failed to parse DeepSeek JSON response');
    }

    const normalized = normalizeAnalysis(parsed);
    const analysis: PortfolioRiskAnalysis = {
      ...normalized,
      degraded: false,
    };

    cache.set(cacheKey, { data: analysis, expiresAt: now + CACHE_TTL_MS });
    logger.info({ positions: normalizedPositions.length, risk: analysis.overall_risk_score }, '[intelligence.portfolio-risk] analysis generated');
    return analysis;
  } catch (error) {
    logger.error({ err: error }, '[intelligence.portfolio-risk] analysis failed, returning degraded fallback');
    let correlationMatrix: Record<string, Record<string, number>> = {};
    try {
      const correlationData = await getHLCorrelationMatrix();
      correlationMatrix = correlationData.matrix;
    } catch {
      correlationMatrix = {};
    }

    const fallback = buildFallbackAnalysis(normalizedPositions, correlationMatrix);
    cache.set(cacheKey, { data: fallback, expiresAt: now + CACHE_TTL_MS });
    return fallback;
  }
}

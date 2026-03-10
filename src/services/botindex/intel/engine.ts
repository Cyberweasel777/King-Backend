/**
 * BotIndex DeepSeek Intelligence Engine
 *
 * Shared engine that takes raw market data from any domain and produces
 * AI-powered analysis: risk scores, signals, fair value estimates, reasoning.
 *
 * Pattern: raw data (free tier) → DeepSeek analysis (paid tier @ $0.05/call)
 * Economics: DeepSeek costs ~$0.002/call, we charge $0.05 = 25x margin.
 */

import logger from '../../../config/logger';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const MODEL = 'deepseek-chat';
const MAX_TOKENS = 4096;
const TEMPERATURE = 0.2;
const REQUEST_TIMEOUT_MS = 30000;
const MAX_CONCURRENT = 3;

// Simple semaphore for concurrency control
let activeRequests = 0;
const waitQueue: Array<() => void> = [];

async function acquireSemaphore(): Promise<void> {
  if (activeRequests < MAX_CONCURRENT) {
    activeRequests++;
    return;
  }
  return new Promise((resolve) => waitQueue.push(() => { activeRequests++; resolve(); }));
}

function releaseSemaphore(): void {
  activeRequests--;
  const next = waitQueue.shift();
  if (next) next();
}

// ─── Types ──────────────────────────────────────────────────────────────────

export type IntelSignal = 'BUY' | 'WATCH' | 'FADE' | 'HOLD';
export type RiskLevel = 'low' | 'medium' | 'high' | 'extreme';
export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface AssetIntel {
  id: string;
  name: string;
  symbol: string;
  signal: IntelSignal;
  confidence: number;          // 0-100
  riskScore: number;           // 0-100, higher = riskier
  riskLevel: RiskLevel;
  fairValueEstimate: number | null;  // estimated fair market cap / value
  currentValue: number;        // current market cap / value
  valuationVerdict: 'undervalued' | 'overvalued' | 'fair' | 'insufficient_data';
  grade: Grade;
  reasoning: string;           // 1-2 sentence plain English
  keyMetrics: Record<string, number | string>;
}

export interface IntelReport {
  domain: string;
  assets: AssetIntel[];
  marketSummary: string;       // 2-3 sentence market overview
  topPick: string | null;      // symbol of best opportunity
  source: 'deepseek' | 'error';
  model: string;
  analyzedAt: string;
  processingMs: number;
}

export type DomainConfig = {
  domain: string;
  systemPrompt: string;
  formatData: (rawData: any) => string;
};

// ─── DeepSeek Call ──────────────────────────────────────────────────────────

async function callDeepSeek(systemPrompt: string, userContent: string): Promise<string | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY not set');
  }

  await acquireSemaphore();
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
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        temperature: TEMPERATURE,
        max_tokens: MAX_TOKENS,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`DeepSeek ${response.status}: ${text}`);
    }

    const data = await response.json() as any;
    return data.choices?.[0]?.message?.content || null;
  } finally {
    clearTimeout(timeout);
    releaseSemaphore();
  }
}

function parseJsonFromResponse<T>(text: string): T | null {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '');
  }
  try {
    return JSON.parse(cleaned.trim()) as T;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]) as T; } catch { return null; }
    }
    return null;
  }
}

// ─── Intel Engine ───────────────────────────────────────────────────────────

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min cache for intel (longer than raw data)
const intelCache = new Map<string, { data: IntelReport; expiresAt: number }>();

export async function generateIntelReport(
  config: DomainConfig,
  rawData: any,
): Promise<IntelReport> {
  const cacheKey = `intel:${config.domain}`;
  const now = Date.now();
  const cached = intelCache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const startMs = Date.now();
  const userContent = config.formatData(rawData);

  try {
    const response = await callDeepSeek(config.systemPrompt, userContent);
    if (!response) {
      throw new Error('Empty DeepSeek response');
    }

    const parsed = parseJsonFromResponse<{
      assets: any[];
      marketSummary: string;
      topPick: string | null;
    }>(response);

    if (!parsed || !Array.isArray(parsed.assets)) {
      throw new Error('Invalid DeepSeek response structure');
    }

    // Normalize and clamp all values
    const assets: AssetIntel[] = parsed.assets.map((a: any) => ({
      id: String(a.id || a.address || ''),
      name: String(a.name || ''),
      symbol: String(a.symbol || ''),
      signal: (['BUY', 'WATCH', 'FADE', 'HOLD'].includes(a.signal) ? a.signal : 'HOLD') as IntelSignal,
      confidence: Math.max(0, Math.min(100, Number(a.confidence) || 50)),
      riskScore: Math.max(0, Math.min(100, Number(a.riskScore) || 50)),
      riskLevel: (['low', 'medium', 'high', 'extreme'].includes(a.riskLevel) ? a.riskLevel : 'medium') as RiskLevel,
      fairValueEstimate: a.fairValueEstimate != null ? Number(a.fairValueEstimate) : null,
      currentValue: Number(a.currentValue) || 0,
      valuationVerdict: (['undervalued', 'overvalued', 'fair', 'insufficient_data'].includes(a.valuationVerdict)
        ? a.valuationVerdict : 'insufficient_data') as AssetIntel['valuationVerdict'],
      grade: (['A', 'B', 'C', 'D', 'F'].includes(a.grade) ? a.grade : 'C') as Grade,
      reasoning: String(a.reasoning || ''),
      keyMetrics: a.keyMetrics || {},
    }));

    const processingMs = Date.now() - startMs;

    const report: IntelReport = {
      domain: config.domain,
      assets,
      marketSummary: String(parsed.marketSummary || ''),
      topPick: parsed.topPick || null,
      source: 'deepseek',
      model: MODEL,
      analyzedAt: new Date().toISOString(),
      processingMs,
    };

    logger.info(
      { domain: config.domain, assets: assets.length, processingMs, topPick: report.topPick },
      'DeepSeek intel report generated',
    );

    intelCache.set(cacheKey, { data: report, expiresAt: now + CACHE_TTL_MS });
    return report;
  } catch (error) {
    logger.error({ err: error, domain: config.domain }, 'DeepSeek intel generation failed');

    if (cached) {
      return cached.data;
    }

    return {
      domain: config.domain,
      assets: [],
      marketSummary: 'Analysis temporarily unavailable.',
      topPick: null,
      source: 'error',
      model: MODEL,
      analyzedAt: new Date().toISOString(),
      processingMs: Date.now() - startMs,
    };
  }
}

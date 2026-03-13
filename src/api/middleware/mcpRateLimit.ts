import type { NextFunction, Request, RequestHandler, Response } from 'express';
import logger from '../../config/logger';
import { getApiKeyEntry } from './apiKeyAuth';

const MCP_FREE_DAILY_LIMIT = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

interface McpRateEntry {
  date: string; // YYYY-MM-DD UTC
  count: number;
}

const mcpDailyCounts = new Map<string, McpRateEntry>();

function utcDateString(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function cleanupStaleEntries(): void {
  const cutoff = utcDateString(new Date(Date.now() - (2 * DAY_MS)));
  for (const [clientId, entry] of mcpDailyCounts.entries()) {
    if (entry.date < cutoff) {
      mcpDailyCounts.delete(clientId);
    }
  }
}

function extractClientIp(req: Request): string {
  const forwardedFor = req.header('x-forwarded-for');
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first) return first;
  }

  return req.ip || req.socket.remoteAddress || 'unknown';
}

function extractApiKey(req: Request): string | null {
  const header = req.header('x-api-key');
  if (!header) return null;
  const firstValue = header.split(',')[0]?.trim();
  return firstValue || null;
}

function hasValidApiKey(req: Request): boolean {
  const apiKey = extractApiKey(req);
  if (!apiKey) return false;
  const entry = getApiKeyEntry(apiKey);
  return Boolean(entry && entry.status === 'active');
}

function getCallWeight(body: unknown): number {
  const countMethod = (item: unknown): number => {
    if (!item || typeof item !== 'object') return 0;
    const method = (item as { method?: unknown }).method;
    if (typeof method !== 'string') return 0;
    return method === 'tools/call' || method === 'resources/read' ? 1 : 0;
  };

  if (Array.isArray(body)) {
    return body.reduce((sum, item) => sum + countMethod(item), 0);
  }

  return countMethod(body);
}

function sendLimitError(res: Response): void {
  res.status(200).json({
    jsonrpc: '2.0',
    error: {
      code: -32000,
      message: 'Daily free limit reached (5/day). Get unlimited access: register at https://king-backend.fly.dev/api/botindex/keys/register?plan=free or pay per call via x402.',
    },
    id: null,
  });
}

export const mcpRateLimit: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  cleanupStaleEntries();

  if (hasValidApiKey(req)) {
    next();
    return;
  }

  const callWeight = getCallWeight(req.body);
  if (callWeight === 0) {
    next();
    return;
  }

  const ip = extractClientIp(req);
  const today = utcDateString();
  const current = mcpDailyCounts.get(ip);

  const priorCount = current && current.date === today ? current.count : 0;
  const nextCount = priorCount + callWeight;
  mcpDailyCounts.set(ip, { date: today, count: nextCount });

  logger.info(`MCP rate limit: ${ip} at ${nextCount}/5`);

  if (nextCount > MCP_FREE_DAILY_LIMIT) {
    sendLimitError(res);
    return;
  }

  next();
};


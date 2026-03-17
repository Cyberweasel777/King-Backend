import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { extractApiKey, getApiKeyEntry } from './apiKeyAuth';

type GateConfig = {
  limit: number;
  message: string;
};

type JsonRecord = Record<string, unknown>;

type ArrayTarget = {
  kind: 'array';
  parent: JsonRecord;
  key: string;
  items: unknown[];
};

type MatrixTarget = {
  kind: 'matrix';
  parent: JsonRecord;
  key: string;
  matrix: JsonRecord;
};

type CollectionTarget = ArrayTarget | MatrixTarget;

const REGISTER_URL = 'https://api.botindex.dev/api/botindex/keys/register?plan=free';
const UPGRADE_URL = 'https://api.botindex.dev/api/botindex/keys/register?plan=pro';
const PRO_UPGRADE_URL = 'https://api.botindex.dev/api/botindex/keys/register?plan=pro';

const ANON_DAILY_LIMIT = parseInt(process.env.ANON_RATE_LIMIT || '10', 10);
const PRIORITY_KEYS = ['results', 'data', 'coins', 'opportunities', 'alerts', 'matrix'] as const;

const ANON_GATE: GateConfig = {
  limit: 3,
  message: 'Get full results with a free API key',
};

const FREE_PLAN_GATE: GateConfig = {
  limit: 5,
  message: 'Upgrade to Pro ($9.99/mo) for full access',
};

function nextUtcMidnightUnix(): number {
  const now = new Date();
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.floor(midnight / 1000);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMatrixRecord(value: unknown): value is JsonRecord {
  if (!isRecord(value)) return false;
  const rowValues = Object.values(value);
  if (rowValues.length === 0) return true;

  return rowValues.every((row) => {
    if (!isRecord(row)) return false;
    return Object.values(row).every((cell) => typeof cell === 'number');
  });
}

function keyRank(key: string): number {
  const index = PRIORITY_KEYS.indexOf(key as (typeof PRIORITY_KEYS)[number]);
  return index >= 0 ? index : PRIORITY_KEYS.length + 10;
}

function pickTarget(body: JsonRecord): CollectionTarget | null {
  let bestArray: { target: ArrayTarget; rank: number; depth: number; length: number } | null = null;
  let bestMatrix: { target: MatrixTarget; rank: number; depth: number } | null = null;

  const queue: Array<{ node: unknown; parent: JsonRecord | null; key: string | null; depth: number }> = [
    { node: body, parent: null, key: null, depth: 0 },
  ];
  const seen = new Set<unknown>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    const { node, parent, key, depth } = current;

    if (Array.isArray(node) && parent && key) {
      const rank = keyRank(key);
      const candidate = {
        target: { kind: 'array', parent, key, items: node } as ArrayTarget,
        rank,
        depth,
        length: node.length,
      };

      if (
        !bestArray ||
        candidate.rank < bestArray.rank ||
        (candidate.rank === bestArray.rank && candidate.depth < bestArray.depth) ||
        (candidate.rank === bestArray.rank && candidate.depth === bestArray.depth && candidate.length > bestArray.length)
      ) {
        bestArray = candidate;
      }
      continue;
    }

    if (!isRecord(node)) continue;
    if (seen.has(node)) continue;
    seen.add(node);

    if (parent && key === 'matrix' && isMatrixRecord(node)) {
      const rank = keyRank(key);
      const candidate = {
        target: { kind: 'matrix', parent, key, matrix: node } as MatrixTarget,
        rank,
        depth,
      };

      if (
        !bestMatrix ||
        candidate.rank < bestMatrix.rank ||
        (candidate.rank === bestMatrix.rank && candidate.depth < bestMatrix.depth)
      ) {
        bestMatrix = candidate;
      }
    }

    if (depth >= 2) continue;
    for (const [childKey, childValue] of Object.entries(node)) {
      queue.push({
        node: childValue,
        parent: node,
        key: childKey,
        depth: depth + 1,
      });
    }
  }

  if (bestArray) return bestArray.target;
  if (bestMatrix) return bestMatrix.target;
  return null;
}

function buildGatedBlock(params: { total: number; showing: number; truncated: boolean; message: string }) {
  return {
    truncated: params.truncated,
    showing: params.showing,
    total: params.total,
    message: params.message,
    register: REGISTER_URL,
    upgrade: UPGRADE_URL,
  };
}

function truncateMatrix(matrix: JsonRecord, limit: number): JsonRecord {
  const selectedRows = Object.keys(matrix).slice(0, limit);
  const next: JsonRecord = {};

  for (const rowKey of selectedRows) {
    const row = matrix[rowKey];
    if (!isRecord(row)) {
      next[rowKey] = row;
      continue;
    }

    const truncatedRow: JsonRecord = {};
    for (const colKey of selectedRows) {
      const cell = row[colKey];
      if (typeof cell === 'number') {
        truncatedRow[colKey] = cell;
      }
    }
    next[rowKey] = truncatedRow;
  }

  return next;
}

function applyGate(body: unknown, gate: GateConfig): unknown {
  if (Array.isArray(body)) {
    const total = body.length;
    const showing = Math.min(gate.limit, total);
    return {
      data: body.slice(0, gate.limit),
      _gated: buildGatedBlock({
        truncated: total > gate.limit,
        showing,
        total,
        message: gate.message,
      }),
    };
  }

  if (!isRecord(body)) return body;

  const target = pickTarget(body);
  if (!target) {
    body._gated = buildGatedBlock({
      truncated: false,
      showing: 0,
      total: 0,
      message: gate.message,
    });
    return body;
  }

  if (target.kind === 'array') {
    const total = target.items.length;
    const showing = Math.min(gate.limit, total);
    target.parent[target.key] = target.items.slice(0, gate.limit);
    body._gated = buildGatedBlock({
      truncated: total > gate.limit,
      showing,
      total,
      message: gate.message,
    });
    return body;
  }

  const total = Object.keys(target.matrix).length;
  const showing = Math.min(gate.limit, total);
  target.parent[target.key] = truncateMatrix(target.matrix, gate.limit);
  body._gated = buildGatedBlock({
    truncated: total > gate.limit,
    showing,
    total,
    message: gate.message,
  });
  return body;
}

function resolveGateConfig(req: Request): GateConfig | null {
  const apiKey = extractApiKey(req);
  if (!apiKey) return ANON_GATE;

  const entry = getApiKeyEntry(apiKey);
  if (!entry || entry.status !== 'active') return ANON_GATE;

  if (entry.plan === 'free') return FREE_PLAN_GATE;
  return null;
}

export function softGate(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const gate = resolveGateConfig(req);
    if (!gate) {
      next();
      return;
    }

    // Inject standard rate-limit headers so bots/scripts see quota info
    res.setHeader('X-RateLimit-Limit', String(ANON_DAILY_LIMIT));
    res.setHeader('X-RateLimit-Remaining', '0');
    res.setHeader('X-RateLimit-Reset', String(nextUtcMidnightUnix()));
    res.setHeader('X-Upgrade-URL', PRO_UPGRADE_URL);

    const originalJson = res.json.bind(res);
    res.json = function softGatedJson(body: unknown) {
      if (!body) {
        return originalJson(body);
      }

      if (isRecord(body) && body.error) {
        return originalJson(body);
      }

      return originalJson(applyGate(body, gate));
    };

    next();
  };
}

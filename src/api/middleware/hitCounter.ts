import type { NextFunction, Request, Response } from 'express';

type HitEntry = {
  count: number;
  lastHit: string;
};

const hits: Record<string, HitEntry> = {};
const startTime = Date.now();

export function hitCounter(req: Request, _res: Response, next: NextFunction): void {
  const path = req.path;

  if (path.includes('botindex') || path.includes('x402')) {
    if (!hits[path]) {
      hits[path] = { count: 0, lastHit: '' };
    }

    hits[path].count += 1;
    hits[path].lastHit = new Date().toISOString();
  }

  next();
}

export function getHits() {
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
  const totalHits = Object.values(hits).reduce((sum, entry) => sum + entry.count, 0);

  return {
    uptime_seconds: uptimeSeconds,
    total_hits: totalHits,
    hits_per_minute: uptimeSeconds > 0 ? Number((totalHits / (uptimeSeconds / 60)).toFixed(2)) : 0,
    endpoints: hits,
    since: new Date(startTime).toISOString(),
  };
}

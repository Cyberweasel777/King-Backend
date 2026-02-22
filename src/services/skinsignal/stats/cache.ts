/**
 * SkinSignal Stats Cache — King Backend
 * Simple in-memory TTL cache
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 15 * 60 * 1_000; // 15 min

class StatsCache {
  private store = new Map<string, CacheEntry<unknown>>();

  set<T>(key: string, value: T, ttlMs = DEFAULT_TTL_MS): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) { this.store.delete(key); return undefined; }
    return entry.value as T;
  }

  delete(key: string): void { this.store.delete(key); }
  clear(): void { this.store.clear(); }
  size(): number { return this.store.size; }
}

export const statsCache = new StatsCache();

export function createCacheKey(prefix: string, params: Record<string, unknown>): string {
  const sorted = Object.keys(params).sort().map(k => `${k}:${JSON.stringify(params[k])}`).join('|');
  return `${prefix}:${sorted}`;
}

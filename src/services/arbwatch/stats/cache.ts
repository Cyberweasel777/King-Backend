/** ArbWatch DeepSeek Stats - Cache */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  key: string;
}

interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
}

const DEFAULT_TTL_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ENTRIES = 1000;

class StatsCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private stats: CacheStats = { hits: 0, misses: 0, evictions: 0 };
  private ttlMs: number;

  constructor(ttlMs = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
    // Periodic cleanup every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  private generateKey(type: string, data: unknown): string {
    const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
    // Simple hash for key generation
    let hash = 0;
    const str = `${type}:${dataStr}`;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `${type}:${Math.abs(hash).toString(36)}`;
  }

  get<T>(type: string, data: unknown): T | null {
    const key = this.generateKey(type, data);
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      this.stats.misses++;
      this.stats.evictions++;
      return null;
    }

    this.stats.hits++;
    return entry.data as T;
  }

  set<T>(type: string, data: unknown, result: T): void {
    // Evict oldest if at capacity
    if (this.cache.size >= MAX_ENTRIES) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
        this.stats.evictions++;
      }
    }

    const key = this.generateKey(type, data);
    this.cache.set(key, {
      data: result,
      timestamp: Date.now(),
      key,
    });
  }

  invalidate(type?: string): void {
    if (type) {
      for (const [key] of this.cache) {
        if (key.startsWith(`${type}:`)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > this.ttlMs) {
        this.cache.delete(key);
        this.stats.evictions++;
      }
    }
  }

  getStats(): CacheStats & { size: number; hitRate: number } {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      size: this.cache.size,
      hitRate: total > 0 ? this.stats.hits / total : 0,
    };
  }
}

export const statsCache = new StatsCache();
export { StatsCache };

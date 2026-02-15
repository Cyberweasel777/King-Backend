/**
 * In-Memory Cache with TTL
 * Shared across agents
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class Cache {
  private store: Map<string, CacheEntry<any>> = new Map();
  private defaultTtl: number;

  constructor(defaultTtlMs: number = 60000) {
    this.defaultTtl = defaultTtlMs;
    
    // Cleanup expired entries every 5 minutes
    setInterval(() => this.cleanup(), 300000);
  }

  generateKey(...parts: string[]): string {
    return parts.join(':');
  }

  set<T>(key: string, data: T, ttlMs?: number): void {
    this.store.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMs || this.defaultTtl,
    });
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.store.delete(key);
      return null;
    }
    
    return entry.data as T;
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.store.delete(key);
      }
    }
  }

  size(): number {
    return this.store.size;
  }
}

// Global cache instances with different TTLs
export const priceCache = new Cache(30000); // 30 seconds for prices
export const tokenCache = new Cache(300000); // 5 minutes for token data
export const sentimentCache = new Cache(600000); // 10 minutes for sentiment
export const riskCache = new Cache(3600000); // 1 hour for risk scores

export default Cache;

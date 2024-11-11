/**
 * Cache Manager
 * 
 * Manages caching for code completions:
 * 1. LRU cache for completion results
 * 2. Intelligent cache invalidation
 * 3. Memory-efficient storage
 */

interface CacheEntry<T> {
  value: T;
  timestamp: number;
  expiresAt: number;
  hitCount: number;
  lastAccessed: number;
}

interface CacheConfig {
  maxSize: number;
  defaultTTL: number;
  cleanupInterval: number;
  maxMemoryUsage: number;
}

interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  evictions: number;
  memoryUsage: number;
}

export class CacheManager<K, V> {
  private cache: Map<K, CacheEntry<V>>;
  private config: CacheConfig;
  private stats: CacheStats;
  private cleanupTimer: ReturnType<typeof setInterval> | null;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      maxSize: 1000,
      defaultTTL: 5 * 60 * 1000, // 5 minutes
      cleanupInterval: 60 * 1000, // 1 minute
      maxMemoryUsage: 50 * 1024 * 1024, // 50MB
      ...config
    };

    this.cache = new Map();
    this.stats = {
      size: 0,
      hits: 0,
      misses: 0,
      evictions: 0,
      memoryUsage: 0
    };

    this.cleanupTimer = null;
    this.startCleanup();
  }

  /**
   * Get a value from cache
   */
  get(key: K): V | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.updateStats();
      this.stats.misses++;
      return undefined;
    }

    entry.hitCount++;
    entry.lastAccessed = Date.now();
    this.stats.hits++;
    return entry.value;
  }

  /**
   * Set a value in cache
   */
  set(key: K, value: V, ttl?: number): void {
    // Check memory usage before adding
    if (this.stats.memoryUsage >= this.config.maxMemoryUsage) {
      this.evictLeastValuable();
    }

    // Ensure we don't exceed max size
    if (this.cache.size >= this.config.maxSize) {
      this.evictOldest();
    }

    const entry: CacheEntry<V> = {
      value,
      timestamp: Date.now(),
      expiresAt: Date.now() + (ttl || this.config.defaultTTL),
      hitCount: 0,
      lastAccessed: Date.now()
    };

    this.cache.set(key, entry);
    this.updateStats();
  }

  /**
   * Delete a value from cache
   */
  delete(key: K): boolean {
    const result = this.cache.delete(key);
    if (result) {
      this.updateStats();
    }
    return result;
  }

  /**
   * Clear all entries from cache
   */
  clear(): void {
    this.cache.clear();
    this.updateStats();
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Start cleanup interval
   */
  private startCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);
  }

  /**
   * Stop cleanup interval
   */
  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Check if entry is expired
   */
  private isExpired(entry: CacheEntry<V>): boolean {
    return Date.now() > entry.expiresAt;
  }

  /**
   * Update cache statistics
   */
  private updateStats(): void {
    this.stats.size = this.cache.size;
    this.stats.memoryUsage = this.estimateMemoryUsage();
  }

  /**
   * Estimate memory usage of cache
   */
  private estimateMemoryUsage(): number {
    let total = 0;
    for (const [key, entry] of this.cache.entries()) {
      // Rough estimation of entry size
      const keySize = typeof key === 'string' ? key.length * 2 : 8;
      const valueSize = this.estimateObjectSize(entry.value);
      total += keySize + valueSize + 32; // Additional overhead for CacheEntry
    }
    return total;
  }

  /**
   * Estimate size of an object in bytes
   */
  private estimateObjectSize(obj: any): number {
    if (obj === null || obj === undefined) return 0;
    
    switch (typeof obj) {
      case 'boolean': return 4;
      case 'number': return 8;
      case 'string': return obj.length * 2;
      case 'object': {
        if (Array.isArray(obj)) {
          return obj.reduce((size, item) => size + this.estimateObjectSize(item), 0);
        }
        return Object.entries(obj).reduce((size, [key, value]) => 
          size + (key.length * 2) + this.estimateObjectSize(value), 0
        );
      }
      default: return 8;
    }
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        this.stats.evictions++;
      }
    }
    this.updateStats();
  }

  /**
   * Evict least valuable entries
   */
  private evictLeastValuable(): void {
    // Calculate value score for each entry
    const scores = new Map<K, number>();
    for (const [key, entry] of this.cache.entries()) {
      const age = Date.now() - entry.timestamp;
      const recency = Date.now() - entry.lastAccessed;
      // Score based on hits, recency, and age
      const score = (entry.hitCount * 0.5) + 
                   (1 / (recency + 1) * 0.3) + 
                   (1 / (age + 1) * 0.2);
      scores.set(key, score);
    }

    // Sort by score and remove lowest scoring entries
    const sortedEntries = Array.from(scores.entries())
      .sort(([, a], [, b]) => a - b);

    // Remove bottom 20% of entries
    const removeCount = Math.ceil(sortedEntries.length * 0.2);
    for (let i = 0; i < removeCount; i++) {
      const [key] = sortedEntries[i];
      this.cache.delete(key);
      this.stats.evictions++;
    }

    this.updateStats();
  }

  /**
   * Evict oldest entries
   */
  private evictOldest(): void {
    const oldestKey = Array.from(this.cache.entries())
      .reduce((oldest, [key, entry]) => 
        !oldest || entry.timestamp < this.cache.get(oldest)!.timestamp ? key : oldest
      , undefined as K | undefined);

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
    }
  }
}

// Export factory function for creating cache instances
export function createCache<K, V>(config?: Partial<CacheConfig>): CacheManager<K, V> {
  return new CacheManager<K, V>(config);
}

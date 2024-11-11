import { createCache, type CacheManager } from './cache-manager';
import type { PatternMatch } from '../learning/pattern-recognizer';

/**
 * Completion Cache Service
 * 
 * Manages caching of code completion results:
 * 1. Context-aware caching
 * 2. Intelligent cache key generation
 * 3. Result validation and freshness
 */

interface CompletionContext {
  code: string;
  filePath: string;
  line: number;
  column: number;
  scope?: string;
  imports?: string[];
}

interface CompletionResult {
  matches: PatternMatch[];
  timestamp: number;
  context: CompletionContext;
}

interface CompletionCacheConfig {
  maxSize: number;
  ttl: number;
  contextSimilarityThreshold: number;
}

export class CompletionCache {
  private cache: CacheManager<string, CompletionResult>;
  private config: CompletionCacheConfig;

  constructor(config: Partial<CompletionCacheConfig> = {}) {
    this.config = {
      maxSize: 500,
      ttl: 5 * 60 * 1000, // 5 minutes
      contextSimilarityThreshold: 0.8,
      ...config
    };

    this.cache = createCache<string, CompletionResult>({
      maxSize: this.config.maxSize,
      defaultTTL: this.config.ttl
    });
  }

  /**
   * Get cached completion result
   */
  get(context: CompletionContext): CompletionResult | undefined {
    const key = this.generateCacheKey(context);
    const exactMatch = this.cache.get(key);

    if (exactMatch) {
      return this.validateResult(exactMatch, context) ? exactMatch : undefined;
    }

    // Try to find similar context if exact match not found
    return this.findSimilarContext(context);
  }

  /**
   * Cache completion result
   */
  set(context: CompletionContext, matches: PatternMatch[]): void {
    const key = this.generateCacheKey(context);
    const result: CompletionResult = {
      matches,
      timestamp: Date.now(),
      context
    };

    this.cache.set(key, result);
  }

  /**
   * Clear cache entries for a specific file
   */
  clearFileCache(filePath: string): void {
    // Implementation note: Since we can't directly query the cache by file path,
    // we'll need to implement this when we add proper cache querying support
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return this.cache.getStats();
  }

  /**
   * Generate cache key from context
   */
  private generateCacheKey(context: CompletionContext): string {
    const { code, filePath, line, column, scope } = context;
    const contextHash = this.hashCode(code);
    return `${filePath}:${line}:${column}:${scope || 'global'}:${contextHash}`;
  }

  /**
   * Find completion result with similar context
   */
  private findSimilarContext(context: CompletionContext): CompletionResult | undefined {
    // TODO: Implement fuzzy matching based on:
    // 1. Code similarity
    // 2. Scope compatibility
    // 3. Import overlap
    return undefined;
  }

  /**
   * Validate cached result
   */
  private validateResult(result: CompletionResult, context: CompletionContext): boolean {
    // Check if the result is still valid for the current context
    const similarity = this.calculateContextSimilarity(result.context, context);
    return similarity >= this.config.contextSimilarityThreshold;
  }

  /**
   * Calculate similarity between two contexts
   */
  private calculateContextSimilarity(a: CompletionContext, b: CompletionContext): number {
    let score = 0;
    let weights = 0;

    // Same file
    if (a.filePath === b.filePath) {
      score += 0.3;
    }
    weights += 0.3;

    // Same scope
    if (a.scope === b.scope) {
      score += 0.2;
    }
    weights += 0.2;

    // Similar code
    const codeSimilarity = this.calculateCodeSimilarity(a.code, b.code);
    score += codeSimilarity * 0.3;
    weights += 0.3;

    // Import overlap
    if (a.imports && b.imports) {
      const importSimilarity = this.calculateImportSimilarity(a.imports, b.imports);
      score += importSimilarity * 0.2;
      weights += 0.2;
    }

    return weights > 0 ? score / weights : 0;
  }

  /**
   * Calculate similarity between code snippets
   */
  private calculateCodeSimilarity(a: string, b: string): number {
    // Simple token-based similarity
    const tokensA = new Set(a.split(/\W+/));
    const tokensB = new Set(b.split(/\W+/));
    
    const intersection = new Set([...tokensA].filter(x => tokensB.has(x)));
    const union = new Set([...tokensA, ...tokensB]);

    return intersection.size / union.size;
  }

  /**
   * Calculate similarity between import lists
   */
  private calculateImportSimilarity(a: string[], b: string[]): number {
    const setA = new Set(a);
    const setB = new Set(b);
    
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);

    return intersection.size / union.size;
  }

  /**
   * Generate hash code for string
   */
  private hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
}

// Export singleton instance
export const completionCache = new CompletionCache();

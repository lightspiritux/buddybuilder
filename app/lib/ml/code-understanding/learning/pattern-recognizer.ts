import { projectIndexer, type CodePattern, type PatternExample } from './project-indexer';
import { contextAnalyzer } from '../analysis/context-analyzer';

/**
 * Pattern Recognizer
 * 
 * Analyzes and matches code patterns to provide intelligent suggestions:
 * 1. Pattern matching and scoring
 * 2. Context-aware pattern selection
 * 3. Pattern similarity analysis
 */

export interface PatternMatch {
  pattern: CodePattern;
  similarity: number;
  context: {
    relevance: number;
    scope: string;
    imports: string[];
  };
  suggestion: {
    text: string;
    displayText: string;
    documentation?: string;
  };
}

interface PatternContext {
  beforeCursor: string;
  afterCursor: string;
  currentLine: string;
  lineNumber: number;
  filePath: string;
  scope?: string;
}

interface SimilarityOptions {
  considerContext: boolean;
  contextWeight: number;
  frequencyWeight: number;
  recencyWeight: number;
}

export class PatternRecognizer {
  private readonly defaultSimilarityOptions: SimilarityOptions = {
    considerContext: true,
    contextWeight: 0.3,
    frequencyWeight: 0.4,
    recencyWeight: 0.3
  };

  /**
   * Find matching patterns for current context
   */
  async findMatches(
    context: PatternContext,
    maxResults: number = 5,
    options: Partial<SimilarityOptions> = {}
  ): Promise<PatternMatch[]> {
    const mergedOptions = { ...this.defaultSimilarityOptions, ...options };
    
    try {
      // Get file context
      const fileContext = await contextAnalyzer.analyzeFile(
        context.filePath,
        context.beforeCursor + context.afterCursor
      );

      // Get all patterns
      const patterns = projectIndexer.getAllPatterns();

      // Score and filter patterns
      const matches = await Promise.all(
        patterns.map(async pattern => {
          const similarity = await this.calculateSimilarity(
            pattern,
            context,
            fileContext,
            mergedOptions
          );

          if (similarity <= 0) return null;

          const suggestion = this.createSuggestion(pattern, context);
          
          return {
            pattern,
            similarity,
            context: {
              relevance: this.calculateContextRelevance(pattern, fileContext),
              scope: context.scope || 'global',
              imports: fileContext.imports.map(imp => imp.path)
            },
            suggestion
          } as PatternMatch;
        })
      );

      // Sort and filter matches
      return matches
        .filter((match): match is PatternMatch => match !== null)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, maxResults);

    } catch (error) {
      console.error('Error finding pattern matches:', error);
      return [];
    }
  }

  /**
   * Calculate pattern similarity score
   */
  private async calculateSimilarity(
    pattern: CodePattern,
    context: PatternContext,
    fileContext: any,
    options: SimilarityOptions
  ): Promise<number> {
    const scores: number[] = [];

    // Pattern text similarity
    scores.push(this.calculateTextSimilarity(
      pattern.pattern,
      context.beforeCursor
    ));

    // Context similarity if enabled
    if (options.considerContext) {
      scores.push(
        this.calculateContextSimilarity(pattern, fileContext) * options.contextWeight
      );
    }

    // Frequency score
    scores.push(
      this.normalizeFrequency(pattern.frequency) * options.frequencyWeight
    );

    // Recency score
    scores.push(
      this.calculateRecencyScore(pattern.lastSeen) * options.recencyWeight
    );

    // Return weighted average
    return scores.reduce((sum, score) => sum + score, 0) / scores.length;
  }

  /**
   * Calculate text similarity using longest common subsequence
   */
  private calculateTextSimilarity(pattern: string, input: string): number {
    const lcs = this.longestCommonSubsequence(
      pattern.toLowerCase(),
      input.toLowerCase()
    );
    return (2 * lcs) / (pattern.length + input.length);
  }

  /**
   * Calculate context similarity
   */
  private calculateContextSimilarity(pattern: CodePattern, fileContext: any): number {
    // Compare imports
    const importSimilarity = this.calculateSetSimilarity(
      new Set(pattern.examples[0].context.match(/import.*?from\s+['"]([^'"]+)['"]/g) || []),
      new Set(fileContext.imports.map((imp: any) => imp.path))
    );

    // Compare scope
    const scopeSimilarity = pattern.examples[0].context.includes(fileContext.scope) ? 1 : 0;

    return (importSimilarity + scopeSimilarity) / 2;
  }

  /**
   * Calculate similarity between two sets
   */
  private calculateSetSimilarity(set1: Set<string>, set2: Set<string>): number {
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    return intersection.size / union.size;
  }

  /**
   * Normalize frequency score
   */
  private normalizeFrequency(frequency: number): number {
    return 1 - (1 / (frequency + 1));
  }

  /**
   * Calculate recency score
   */
  private calculateRecencyScore(lastSeen: number): number {
    const daysSince = (Date.now() - lastSeen) / (1000 * 60 * 60 * 24);
    return Math.exp(-daysSince / 7); // Decay over a week
  }

  /**
   * Calculate context relevance
   */
  private calculateContextRelevance(pattern: CodePattern, fileContext: any): number {
    // Consider:
    // 1. Import overlap
    // 2. Scope compatibility
    // 3. Usage patterns
    return 0.5; // TODO: Implement proper relevance calculation
  }

  /**
   * Create suggestion from pattern
   */
  private createSuggestion(pattern: CodePattern, context: PatternContext) {
    // Basic suggestion
    const suggestion = {
      text: pattern.pattern,
      displayText: pattern.pattern,
      documentation: this.createDocumentation(pattern)
    };

    // Enhance based on pattern type
    switch (pattern.type) {
      case 'import':
        return this.enhanceImportSuggestion(suggestion, pattern, context);
      case 'function':
        return this.enhanceFunctionSuggestion(suggestion, pattern, context);
      case 'class':
        return this.enhanceClassSuggestion(suggestion, pattern, context);
      default:
        return suggestion;
    }
  }

  /**
   * Enhance import suggestion
   */
  private enhanceImportSuggestion(
    suggestion: PatternMatch['suggestion'],
    pattern: CodePattern,
    context: PatternContext
  ) {
    // Add any missing imports
    return {
      ...suggestion,
      documentation: `Import from ${pattern.examples[0].path}\n${suggestion.documentation}`
    };
  }

  /**
   * Enhance function suggestion
   */
  private enhanceFunctionSuggestion(
    suggestion: PatternMatch['suggestion'],
    pattern: CodePattern,
    context: PatternContext
  ) {
    // Add parameter hints and return type
    return suggestion;
  }

  /**
   * Enhance class suggestion
   */
  private enhanceClassSuggestion(
    suggestion: PatternMatch['suggestion'],
    pattern: CodePattern,
    context: PatternContext
  ) {
    // Add constructor and method hints
    return suggestion;
  }

  /**
   * Create documentation for pattern
   */
  private createDocumentation(pattern: CodePattern): string {
    return [
      `Type: ${pattern.type}`,
      `Used ${pattern.frequency} times`,
      `Examples:`,
      ...pattern.examples.slice(0, 2).map((ex: PatternExample) => 
        `\nIn ${ex.path}:\n${ex.code}`
      )
    ].join('\n');
  }

  /**
   * Calculate longest common subsequence length
   */
  private longestCommonSubsequence(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;
    const dp: number[][] = Array(m + 1).fill(0).map(() => Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    return dp[m][n];
  }
}

// Export singleton instance
export const patternRecognizer = new PatternRecognizer();

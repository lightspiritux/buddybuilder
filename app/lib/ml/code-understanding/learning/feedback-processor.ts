import { completionLogger, type CompletionStats, type PatternStats } from './completion-logger';
import { patternRecognizer } from './pattern-recognizer';
import { projectIndexer } from './project-indexer';
import { completionRules } from './completion-rules';

/**
 * Feedback Processor
 * 
 * Processes and learns from completion feedback:
 * 1. Analyzes completion usage patterns
 * 2. Updates pattern scores and relevance
 * 3. Adjusts completion rules based on feedback
 */

interface FeedbackAnalysis {
  patterns: {
    topPatterns: Array<{
      pattern: string;
      acceptanceRate: number;
      confidence: number;
    }>;
    problematicPatterns: Array<{
      pattern: string;
      rejectionRate: number;
      issues: string[];
    }>;
  };
  rules: {
    effectiveRules: string[];
    ineffectiveRules: string[];
    suggestedAdjustments: Array<{
      ruleId: string;
      adjustments: string[];
    }>;
  };
  performance: {
    averageAcceptanceTime: number;
    suggestionQuality: number;
    contextRelevance: number;
  };
}

interface LearningConfig {
  minAcceptanceRate: number;
  minConfidenceThreshold: number;
  learningRate: number;
  feedbackWindowDays: number;
  patternBoostFactor: number;
  patternPenaltyFactor: number;
}

export class FeedbackProcessor {
  private config: LearningConfig;
  private lastProcessingTime: number;
  private analysisCache: Map<string, FeedbackAnalysis>;

  constructor(config: Partial<LearningConfig> = {}) {
    this.config = {
      minAcceptanceRate: 0.6,
      minConfidenceThreshold: 0.7,
      learningRate: 0.1,
      feedbackWindowDays: 7,
      patternBoostFactor: 1.2,
      patternPenaltyFactor: 0.8,
      ...config
    };
    this.lastProcessingTime = 0;
    this.analysisCache = new Map();
  }

  /**
   * Process feedback and update learning models
   */
  async processFeedback(): Promise<FeedbackAnalysis> {
    const stats = completionLogger.getStats();
    const analysis = this.analyzeFeedback(stats);

    // Update pattern scores
    this.updatePatternScores(analysis);

    // Adjust completion rules
    this.adjustCompletionRules(analysis);

    // Cache analysis
    const cacheKey = this.generateCacheKey();
    this.analysisCache.set(cacheKey, analysis);
    this.lastProcessingTime = Date.now();

    return analysis;
  }

  /**
   * Analyze completion feedback
   */
  private analyzeFeedback(stats: CompletionStats): FeedbackAnalysis {
    const analysis: FeedbackAnalysis = {
      patterns: {
        topPatterns: [],
        problematicPatterns: []
      },
      rules: {
        effectiveRules: [],
        ineffectiveRules: [],
        suggestedAdjustments: []
      },
      performance: {
        averageAcceptanceTime: stats.averageAcceptanceTime,
        suggestionQuality: this.calculateSuggestionQuality(stats),
        contextRelevance: this.calculateContextRelevance(stats)
      }
    };

    // Analyze patterns
    for (const [patternId, patternStats] of stats.patternStats) {
      const acceptanceRate = patternStats.accepts / patternStats.uses;
      const rejectionRate = patternStats.rejects / patternStats.uses;

      if (acceptanceRate >= this.config.minAcceptanceRate) {
        analysis.patterns.topPatterns.push({
          pattern: patternId,
          acceptanceRate,
          confidence: patternStats.averageConfidence
        });
      }

      if (rejectionRate > (1 - this.config.minAcceptanceRate)) {
        analysis.patterns.problematicPatterns.push({
          pattern: patternId,
          rejectionRate,
          issues: this.identifyPatternIssues(patternStats)
        });
      }
    }

    // Sort patterns by acceptance rate
    analysis.patterns.topPatterns.sort((a, b) => b.acceptanceRate - a.acceptanceRate);
    analysis.patterns.problematicPatterns.sort((a, b) => b.rejectionRate - a.rejectionRate);

    return analysis;
  }

  /**
   * Update pattern scores based on feedback
   */
  private updatePatternScores(analysis: FeedbackAnalysis): void {
    // Boost successful patterns
    analysis.patterns.topPatterns.forEach(({ pattern }) => {
      const existingPattern = projectIndexer.getFilePatterns('').find(p => p.pattern === pattern);
      if (existingPattern) {
        existingPattern.score *= this.config.patternBoostFactor;
      }
    });

    // Penalize problematic patterns
    analysis.patterns.problematicPatterns.forEach(({ pattern }) => {
      const existingPattern = projectIndexer.getFilePatterns('').find(p => p.pattern === pattern);
      if (existingPattern) {
        existingPattern.score *= this.config.patternPenaltyFactor;
      }
    });
  }

  /**
   * Adjust completion rules based on feedback
   */
  private adjustCompletionRules(analysis: FeedbackAnalysis): void {
    analysis.rules.suggestedAdjustments.forEach(({ ruleId, adjustments }) => {
      // TODO: Implement rule adjustment logic
    });
  }

  /**
   * Calculate overall suggestion quality
   */
  private calculateSuggestionQuality(stats: CompletionStats): number {
    const { totalSuggestions, acceptedSuggestions, modifiedSuggestions } = stats;
    if (totalSuggestions === 0) return 0;

    const acceptanceWeight = 1.0;
    const modificationWeight = 0.5;

    return (
      (acceptedSuggestions * acceptanceWeight + modifiedSuggestions * modificationWeight) /
      totalSuggestions
    );
  }

  /**
   * Calculate context relevance score
   */
  private calculateContextRelevance(stats: CompletionStats): number {
    let totalRelevance = 0;
    let patternCount = 0;

    stats.patternStats.forEach(patternStats => {
      totalRelevance += patternStats.averageRelevance;
      patternCount++;
    });

    return patternCount > 0 ? totalRelevance / patternCount : 0;
  }

  /**
   * Identify issues with problematic patterns
   */
  private identifyPatternIssues(patternStats: PatternStats): string[] {
    const issues: string[] = [];

    if (patternStats.averageConfidence < this.config.minConfidenceThreshold) {
      issues.push('Low confidence score');
    }

    if (patternStats.modifications / patternStats.uses > 0.5) {
      issues.push('High modification rate');
    }

    if (patternStats.averageRelevance < 0.5) {
      issues.push('Low context relevance');
    }

    return issues;
  }

  /**
   * Generate cache key for analysis results
   */
  private generateCacheKey(): string {
    const date = new Date();
    return `analysis-${date.toISOString().split('T')[0]}`;
  }

  /**
   * Get cached analysis results
   */
  getCachedAnalysis(date: string): FeedbackAnalysis | undefined {
    return this.analysisCache.get(`analysis-${date}`);
  }

  /**
   * Clear old cache entries
   */
  clearOldCache(maxAge: number = 30 * 24 * 60 * 60 * 1000): void {
    const cutoff = Date.now() - maxAge;
    for (const [key, value] of this.analysisCache.entries()) {
      const date = key.split('-')[1];
      if (new Date(date).getTime() < cutoff) {
        this.analysisCache.delete(key);
      }
    }
  }
}

// Export singleton instance
export const feedbackProcessor = new FeedbackProcessor();

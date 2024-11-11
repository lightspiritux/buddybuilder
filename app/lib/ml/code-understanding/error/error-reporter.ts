/**
 * Error Reporter
 * 
 * Provides error tracking, analysis, and reporting capabilities:
 * 1. Error aggregation and categorization
 * 2. Error pattern detection
 * 3. Error reporting and analytics
 */

import { ErrorCategory, ErrorSeverity, type ErrorContext, type ErrorReport } from './error-boundary';

interface ErrorPattern {
  pattern: RegExp | string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  description: string;
  suggestedAction?: string;
}

interface ErrorMetrics {
  totalErrors: number;
  errorsByCategory: Record<ErrorCategory, number>;
  errorsBySeverity: Record<ErrorSeverity, number>;
  topErrors: Array<{
    message: string;
    count: number;
    category: ErrorCategory;
    severity: ErrorSeverity;
  }>;
  averageRecoveryRate: number;
  meanTimeBetweenErrors: number;
}

interface ErrorAnalysis {
  patterns: ErrorPattern[];
  metrics: ErrorMetrics;
  recommendations: string[];
}

export class ErrorReporter {
  private static instance: ErrorReporter;
  private errorHistory: ErrorReport[] = [];
  private patterns: ErrorPattern[] = [];
  private subscribers: Set<(report: ErrorReport) => void> = new Set();
  private analyticsCallback?: (analysis: ErrorAnalysis) => void;
  private maxHistorySize: number = 1000;
  private lastAnalysis?: Date;
  private analysisInterval: number = 60 * 60 * 1000; // 1 hour

  private constructor() {
    this.initializeDefaultPatterns();
  }

  static getInstance(): ErrorReporter {
    if (!ErrorReporter.instance) {
      ErrorReporter.instance = new ErrorReporter();
    }
    return ErrorReporter.instance;
  }

  /**
   * Report a new error
   */
  reportError(error: Error, category: ErrorCategory, context: ErrorContext): void {
    const pattern = this.findMatchingPattern(error);
    const severity = pattern?.severity || this.calculateSeverity(error, category);

    const report: ErrorReport = {
      error,
      category,
      severity,
      context,
      stack: error.stack,
      handled: false,
      recoveryAttempted: false
    };

    this.addToHistory(report);
    this.notifySubscribers(report);
    this.checkForAnalysis();
  }

  /**
   * Subscribe to error reports
   */
  subscribe(callback: (report: ErrorReport) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  /**
   * Set analytics callback
   */
  setAnalyticsCallback(callback: (analysis: ErrorAnalysis) => void): void {
    this.analyticsCallback = callback;
  }

  /**
   * Add error pattern
   */
  addPattern(pattern: ErrorPattern): void {
    this.patterns.push(pattern);
  }

  /**
   * Get error metrics
   */
  getMetrics(): ErrorMetrics {
    const metrics = this.calculateMetrics();
    return metrics;
  }

  /**
   * Get error analysis
   */
  getAnalysis(): ErrorAnalysis {
    const analysis = this.analyzeErrors();
    return analysis;
  }

  /**
   * Clear error history
   */
  clearHistory(): void {
    this.errorHistory = [];
  }

  private initializeDefaultPatterns(): void {
    this.patterns = [
      {
        pattern: /out of memory/i,
        category: ErrorCategory.MEMORY,
        severity: ErrorSeverity.CRITICAL,
        description: 'Memory exhaustion error',
        suggestedAction: 'Trigger garbage collection and reduce memory usage'
      },
      {
        pattern: /network|connection|timeout/i,
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.HIGH,
        description: 'Network-related error',
        suggestedAction: 'Implement retry with exponential backoff'
      },
      {
        pattern: /worker.*(?:crash|fail)/i,
        category: ErrorCategory.WORKER,
        severity: ErrorSeverity.HIGH,
        description: 'Worker failure',
        suggestedAction: 'Restart worker and redistribute tasks'
      },
      {
        pattern: /resource.*(?:unavailable|exhausted)/i,
        category: ErrorCategory.RESOURCE,
        severity: ErrorSeverity.HIGH,
        description: 'Resource exhaustion',
        suggestedAction: 'Implement resource pooling and cleanup'
      }
    ];
  }

  private findMatchingPattern(error: Error): ErrorPattern | undefined {
    return this.patterns.find(pattern => {
      if (pattern.pattern instanceof RegExp) {
        return pattern.pattern.test(error.message);
      }
      return error.message.includes(pattern.pattern);
    });
  }

  private calculateSeverity(error: Error, category: ErrorCategory): ErrorSeverity {
    if (category === ErrorCategory.MEMORY || error.message.includes('critical')) {
      return ErrorSeverity.CRITICAL;
    }
    if (category === ErrorCategory.WORKER || category === ErrorCategory.SYSTEM) {
      return ErrorSeverity.HIGH;
    }
    if (category === ErrorCategory.NETWORK || category === ErrorCategory.RESOURCE) {
      return ErrorSeverity.MEDIUM;
    }
    return ErrorSeverity.LOW;
  }

  private addToHistory(report: ErrorReport): void {
    this.errorHistory.push(report);
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory.shift();
    }
  }

  private notifySubscribers(report: ErrorReport): void {
    this.subscribers.forEach(subscriber => {
      try {
        subscriber(report);
      } catch (error) {
        console.error('Error in error subscriber:', error);
      }
    });
  }

  private checkForAnalysis(): void {
    const now = new Date();
    if (!this.lastAnalysis || now.getTime() - this.lastAnalysis.getTime() >= this.analysisInterval) {
      const analysis = this.analyzeErrors();
      this.lastAnalysis = now;
      if (this.analyticsCallback) {
        this.analyticsCallback(analysis);
      }
    }
  }

  private calculateMetrics(): ErrorMetrics {
    const metrics: ErrorMetrics = {
      totalErrors: this.errorHistory.length,
      errorsByCategory: {} as Record<ErrorCategory, number>,
      errorsBySeverity: {} as Record<ErrorSeverity, number>,
      topErrors: [],
      averageRecoveryRate: 0,
      meanTimeBetweenErrors: 0
    };

    // Initialize counters
    Object.values(ErrorCategory).forEach(category => {
      metrics.errorsByCategory[category] = 0;
    });
    Object.values(ErrorSeverity).forEach(severity => {
      metrics.errorsBySeverity[severity] = 0;
    });

    // Calculate error frequencies
    const errorCounts = new Map<string, {
      count: number;
      category: ErrorCategory;
      severity: ErrorSeverity;
    }>();

    let recoveredCount = 0;
    let lastErrorTime: number | null = null;
    let totalTimeBetweenErrors = 0;
    let timeBetweenErrorsCount = 0;

    this.errorHistory.forEach((report, index) => {
      metrics.errorsByCategory[report.category]++;
      metrics.errorsBySeverity[report.severity]++;

      const key = report.error.message;
      const existing = errorCounts.get(key) || {
        count: 0,
        category: report.category,
        severity: report.severity
      };
      errorCounts.set(key, { ...existing, count: existing.count + 1 });

      if (report.recoverySuccessful) {
        recoveredCount++;
      }

      if (lastErrorTime !== null) {
        const timeBetween = report.context.timestamp - lastErrorTime;
        totalTimeBetweenErrors += timeBetween;
        timeBetweenErrorsCount++;
      }
      lastErrorTime = report.context.timestamp;
    });

    // Calculate top errors
    metrics.topErrors = Array.from(errorCounts.entries())
      .map(([message, data]) => ({
        message,
        ...data
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Calculate recovery rate
    metrics.averageRecoveryRate = recoveredCount / this.errorHistory.length;

    // Calculate mean time between errors
    metrics.meanTimeBetweenErrors = timeBetweenErrorsCount > 0
      ? totalTimeBetweenErrors / timeBetweenErrorsCount
      : 0;

    return metrics;
  }

  private analyzeErrors(): ErrorAnalysis {
    const metrics = this.calculateMetrics();
    const recommendations: string[] = [];

    // Analyze patterns and make recommendations
    if (metrics.errorsBySeverity[ErrorSeverity.CRITICAL] > 0) {
      recommendations.push('Critical errors detected - immediate attention required');
    }

    if (metrics.errorsByCategory[ErrorCategory.MEMORY] > 0) {
      recommendations.push('Consider implementing memory optimization strategies');
    }

    if (metrics.errorsByCategory[ErrorCategory.NETWORK] > 0) {
      recommendations.push('Implement robust network error handling and retries');
    }

    if (metrics.averageRecoveryRate < 0.8) {
      recommendations.push('Improve error recovery mechanisms');
    }

    if (metrics.meanTimeBetweenErrors < 60000) { // Less than 1 minute
      recommendations.push('High error frequency detected - review error patterns');
    }

    // Add pattern-specific recommendations
    metrics.topErrors.forEach(error => {
      const pattern = this.findMatchingPattern(new Error(error.message));
      if (pattern?.suggestedAction) {
        recommendations.push(
          `For "${error.message}" (${error.count} occurrences): ${pattern.suggestedAction}`
        );
      }
    });

    return {
      patterns: this.patterns,
      metrics,
      recommendations
    };
  }
}

// Export singleton instance
export const errorReporter = ErrorReporter.getInstance();

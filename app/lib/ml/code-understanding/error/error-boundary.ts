/**
 * Error Boundary System
 * 
 * Provides error handling and recovery for ML components:
 * 1. Error capture and categorization
 * 2. Recovery strategies
 * 3. Error reporting
 */

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum ErrorCategory {
  MODEL = 'model',
  MEMORY = 'memory',
  WORKER = 'worker',
  TASK = 'task',
  RESOURCE = 'resource',
  NETWORK = 'network',
  SYSTEM = 'system'
}

export interface ErrorContext {
  component: string;
  operation: string;
  timestamp: number;
  data?: any;
}

export interface ErrorReport {
  error: Error;
  severity: ErrorSeverity;
  category: ErrorCategory;
  context: ErrorContext;
  stack?: string;
  handled: boolean;
  recoveryAttempted: boolean;
  recoverySuccessful?: boolean;
}

export interface RecoveryStrategy {
  name: string;
  condition: (error: Error, context: ErrorContext) => boolean;
  action: (error: Error, context: ErrorContext) => Promise<boolean>;
  maxAttempts: number;
}

export class ErrorBoundary {
  private static instance: ErrorBoundary;
  private recoveryStrategies: Map<ErrorCategory, RecoveryStrategy[]>;
  private errorHistory: ErrorReport[];
  private maxHistorySize: number;
  private errorCallbacks: Set<(report: ErrorReport) => void>;
  private recoveryCallbacks: Set<(report: ErrorReport, success: boolean) => void>;

  private constructor() {
    this.recoveryStrategies = new Map();
    this.errorHistory = [];
    this.maxHistorySize = 100;
    this.errorCallbacks = new Set();
    this.recoveryCallbacks = new Set();
    this.initializeDefaultStrategies();
  }

  static getInstance(): ErrorBoundary {
    if (!ErrorBoundary.instance) {
      ErrorBoundary.instance = new ErrorBoundary();
    }
    return ErrorBoundary.instance;
  }

  /**
   * Handle error with recovery attempt
   */
  async handleError(
    error: Error,
    category: ErrorCategory,
    context: ErrorContext
  ): Promise<ErrorReport> {
    const severity = this.calculateSeverity(error, category, context);
    const report: ErrorReport = {
      error,
      severity,
      category,
      context,
      stack: error.stack,
      handled: false,
      recoveryAttempted: false
    };

    try {
      // Notify error listeners
      this.notifyErrorListeners(report);

      // Attempt recovery
      const strategies = this.recoveryStrategies.get(category) || [];
      for (const strategy of strategies) {
        if (strategy.condition(error, context)) {
          report.recoveryAttempted = true;
          const success = await strategy.action(error, context);
          report.recoverySuccessful = success;
          this.notifyRecoveryListeners(report, success);
          if (success) {
            report.handled = true;
            break;
          }
        }
      }

      // Add to history
      this.addToHistory(report);
      return report;
    } catch (recoveryError) {
      console.error('Error in error handling:', recoveryError);
      report.handled = false;
      report.recoveryAttempted = true;
      report.recoverySuccessful = false;
      this.addToHistory(report);
      return report;
    }
  }

  /**
   * Add recovery strategy
   */
  addRecoveryStrategy(category: ErrorCategory, strategy: RecoveryStrategy): void {
    const strategies = this.recoveryStrategies.get(category) || [];
    strategies.push(strategy);
    this.recoveryStrategies.set(category, strategies);
  }

  /**
   * Subscribe to error events
   */
  onError(callback: (report: ErrorReport) => void): () => void {
    this.errorCallbacks.add(callback);
    return () => this.errorCallbacks.delete(callback);
  }

  /**
   * Subscribe to recovery events
   */
  onRecovery(callback: (report: ErrorReport, success: boolean) => void): () => void {
    this.recoveryCallbacks.add(callback);
    return () => this.recoveryCallbacks.delete(callback);
  }

  /**
   * Get error history
   */
  getErrorHistory(): ErrorReport[] {
    return [...this.errorHistory];
  }

  /**
   * Clear error history
   */
  clearErrorHistory(): void {
    this.errorHistory = [];
  }

  /**
   * Initialize default recovery strategies
   */
  private initializeDefaultStrategies(): void {
    // Memory errors
    this.addRecoveryStrategy(ErrorCategory.MEMORY, {
      name: 'memory-cleanup',
      condition: (error) => error.message.includes('memory'),
      action: async () => {
        try {
          if (globalThis.gc) {
            globalThis.gc();
          }
          return true;
        } catch {
          return false;
        }
      },
      maxAttempts: 3
    });

    // Worker errors
    this.addRecoveryStrategy(ErrorCategory.WORKER, {
      name: 'worker-restart',
      condition: (error) => error.message.includes('worker'),
      action: async (error, context) => {
        try {
          // Attempt to restart worker
          if (context.data?.worker) {
            context.data.worker.terminate();
            await context.data.worker.initialize();
          }
          return true;
        } catch {
          return false;
        }
      },
      maxAttempts: 2
    });

    // Network errors
    this.addRecoveryStrategy(ErrorCategory.NETWORK, {
      name: 'network-retry',
      condition: (error) => error instanceof TypeError && error.message.includes('network'),
      action: async (error, context) => {
        try {
          if (context.data?.retry) {
            await context.data.retry();
            return true;
          }
          return false;
        } catch {
          return false;
        }
      },
      maxAttempts: 3
    });
  }

  /**
   * Calculate error severity
   */
  private calculateSeverity(
    error: Error,
    category: ErrorCategory,
    context: ErrorContext
  ): ErrorSeverity {
    // Critical errors
    if (
      category === ErrorCategory.MEMORY ||
      error.message.includes('out of memory') ||
      error.message.includes('crash') ||
      error.message.includes('fatal')
    ) {
      return ErrorSeverity.CRITICAL;
    }

    // High severity errors
    if (
      category === ErrorCategory.WORKER ||
      category === ErrorCategory.SYSTEM ||
      error.message.includes('failed') ||
      error.message.includes('error')
    ) {
      return ErrorSeverity.HIGH;
    }

    // Medium severity errors
    if (
      category === ErrorCategory.NETWORK ||
      category === ErrorCategory.TASK ||
      error.message.includes('timeout') ||
      error.message.includes('retry')
    ) {
      return ErrorSeverity.MEDIUM;
    }

    // Default to low severity
    return ErrorSeverity.LOW;
  }

  /**
   * Add error report to history
   */
  private addToHistory(report: ErrorReport): void {
    this.errorHistory.push(report);
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory.shift();
    }
  }

  /**
   * Notify error listeners
   */
  private notifyErrorListeners(report: ErrorReport): void {
    this.errorCallbacks.forEach(callback => {
      try {
        callback(report);
      } catch (error) {
        console.error('Error in error callback:', error);
      }
    });
  }

  /**
   * Notify recovery listeners
   */
  private notifyRecoveryListeners(report: ErrorReport, success: boolean): void {
    this.recoveryCallbacks.forEach(callback => {
      try {
        callback(report, success);
      } catch (error) {
        console.error('Error in recovery callback:', error);
      }
    });
  }
}

// Export singleton instance
export const errorBoundary = ErrorBoundary.getInstance();

/**
 * Performance Tracker
 * 
 * Provides performance monitoring and analysis:
 * 1. Operation timing
 * 2. Resource usage tracking
 * 3. Performance bottleneck detection
 * 4. Trend analysis
 * 5. Performance recommendations
 */

import { metricsCollector, MetricType, MetricCategory } from './metrics-collector';

export enum OperationType {
  MODEL_INFERENCE = 'model_inference',
  CODE_COMPLETION = 'code_completion',
  FILE_INDEXING = 'file_indexing',
  PATTERN_MATCHING = 'pattern_matching',
  CONTEXT_ANALYSIS = 'context_analysis',
  WORKER_TASK = 'worker_task',
  RESOURCE_CLEANUP = 'resource_cleanup'
}

export interface OperationContext {
  component: string;
  operation: OperationType;
  labels?: Record<string, string>;
}

export interface PerformanceThresholds {
  warning: number;
  critical: number;
}

export interface PerformanceRecommendation {
  operation: OperationType;
  currentMetric: number;
  threshold: number;
  severity: 'warning' | 'critical';
  recommendation: string;
}

const DEFAULT_THRESHOLDS: Record<OperationType, PerformanceThresholds> = {
  [OperationType.MODEL_INFERENCE]: { warning: 100, critical: 200 },
  [OperationType.CODE_COMPLETION]: { warning: 150, critical: 300 },
  [OperationType.FILE_INDEXING]: { warning: 500, critical: 1000 },
  [OperationType.PATTERN_MATCHING]: { warning: 50, critical: 100 },
  [OperationType.CONTEXT_ANALYSIS]: { warning: 200, critical: 400 },
  [OperationType.WORKER_TASK]: { warning: 300, critical: 600 },
  [OperationType.RESOURCE_CLEANUP]: { warning: 100, critical: 200 }
};

export class PerformanceTracker {
  private static instance: PerformanceTracker;
  private thresholds: Record<OperationType, PerformanceThresholds>;
  private subscribers: Set<(recommendations: PerformanceRecommendation[]) => void>;
  private operationTimers: Map<string, number>;
  private analysisInterval: ReturnType<typeof setInterval> | null = null;

  private constructor() {
    this.thresholds = { ...DEFAULT_THRESHOLDS };
    this.subscribers = new Set();
    this.operationTimers = new Map();
    this.initializeMetrics();
    this.startAnalysis();
  }

  static getInstance(): PerformanceTracker {
    if (!PerformanceTracker.instance) {
      PerformanceTracker.instance = new PerformanceTracker();
    }
    return PerformanceTracker.instance;
  }

  /**
   * Start timing an operation
   */
  startOperation(context: OperationContext): string {
    const id = this.generateOperationId(context);
    this.operationTimers.set(id, performance.now());
    return id;
  }

  /**
   * End timing an operation
   */
  endOperation(id: string, context: OperationContext): void {
    const startTime = this.operationTimers.get(id);
    if (!startTime) {
      console.warn(`No start time found for operation ${id}`);
      return;
    }

    const duration = performance.now() - startTime;
    this.operationTimers.delete(id);

    // Record duration metric
    const metricName = `${context.operation}_duration`;
    metricsCollector.record(metricName, duration, context.labels);

    // Check thresholds and notify if exceeded
    this.checkThresholds(context.operation, duration);
  }

  /**
   * Set custom performance thresholds
   */
  setThresholds(operation: OperationType, thresholds: PerformanceThresholds): void {
    this.thresholds[operation] = thresholds;
  }

  /**
   * Subscribe to performance recommendations
   */
  subscribe(callback: (recommendations: PerformanceRecommendation[]) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  /**
   * Get current performance analysis
   */
  getAnalysis(): PerformanceRecommendation[] {
    return this.analyzePerformance();
  }

  dispose(): void {
    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = null;
    }
    this.subscribers.clear();
    this.operationTimers.clear();
  }

  private initializeMetrics(): void {
    // Register duration metrics for each operation type
    Object.values(OperationType).forEach(operation => {
      metricsCollector.registerMetric({
        name: `${operation}_duration`,
        type: MetricType.HISTOGRAM,
        category: MetricCategory.PERFORMANCE,
        description: `Duration of ${operation} operations`,
        unit: 'ms'
      });
    });

    // Register resource usage metrics
    metricsCollector.registerMetric({
      name: 'performance_cpu_usage',
      type: MetricType.GAUGE,
      category: MetricCategory.PERFORMANCE,
      description: 'CPU usage during operations',
      unit: 'percentage'
    });

    metricsCollector.registerMetric({
      name: 'performance_memory_usage',
      type: MetricType.GAUGE,
      category: MetricCategory.PERFORMANCE,
      description: 'Memory usage during operations',
      unit: 'bytes'
    });
  }

  private startAnalysis(): void {
    this.analysisInterval = setInterval(() => {
      const recommendations = this.analyzePerformance();
      if (recommendations.length > 0) {
        this.notifySubscribers(recommendations);
      }
    }, 60000); // Analyze every minute
  }

  private analyzePerformance(): PerformanceRecommendation[] {
    const recommendations: PerformanceRecommendation[] = [];
    const report = metricsCollector.getReport();

    Object.values(OperationType).forEach(operation => {
      const metricName = `${operation}_duration`;
      const metric = report.metrics[metricName];
      if (!metric?.summary) return;

      const { p95: currentMetric } = metric.summary;
      const thresholds = this.thresholds[operation];

      if (currentMetric > thresholds.critical) {
        recommendations.push(this.createRecommendation(
          operation,
          currentMetric,
          thresholds.critical,
          'critical'
        ));
      } else if (currentMetric > thresholds.warning) {
        recommendations.push(this.createRecommendation(
          operation,
          currentMetric,
          thresholds.warning,
          'warning'
        ));
      }
    });

    return recommendations;
  }

  private createRecommendation(
    operation: OperationType,
    currentMetric: number,
    threshold: number,
    severity: 'warning' | 'critical'
  ): PerformanceRecommendation {
    const recommendations: Record<OperationType, string> = {
      [OperationType.MODEL_INFERENCE]: 'Consider model optimization or quantization',
      [OperationType.CODE_COMPLETION]: 'Review completion cache strategy',
      [OperationType.FILE_INDEXING]: 'Optimize indexing algorithm or increase batch size',
      [OperationType.PATTERN_MATCHING]: 'Review pattern matching algorithm efficiency',
      [OperationType.CONTEXT_ANALYSIS]: 'Optimize context analysis or add caching',
      [OperationType.WORKER_TASK]: 'Review worker pool size and task distribution',
      [OperationType.RESOURCE_CLEANUP]: 'Optimize cleanup strategy or increase cleanup interval'
    };

    return {
      operation,
      currentMetric,
      threshold,
      severity,
      recommendation: recommendations[operation]
    };
  }

  private generateOperationId(context: OperationContext): string {
    return `${context.component}_${context.operation}_${Date.now()}`;
  }

  private checkThresholds(operation: OperationType, duration: number): void {
    const thresholds = this.thresholds[operation];
    if (duration > thresholds.critical || duration > thresholds.warning) {
      const recommendations = [this.createRecommendation(
        operation,
        duration,
        duration > thresholds.critical ? thresholds.critical : thresholds.warning,
        duration > thresholds.critical ? 'critical' : 'warning'
      )];
      this.notifySubscribers(recommendations);
    }
  }

  private notifySubscribers(recommendations: PerformanceRecommendation[]): void {
    this.subscribers.forEach(subscriber => {
      try {
        subscriber(recommendations);
      } catch (error) {
        console.error('Error in performance subscriber:', error);
      }
    });
  }
}

// Export singleton instance
export const performanceTracker = PerformanceTracker.getInstance();

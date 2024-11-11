/**
 * Metrics Collector
 * 
 * Provides system-wide metrics collection and analysis:
 * 1. Performance metrics
 * 2. Usage metrics
 * 3. Resource utilization
 * 4. Model performance
 * 5. User interactions
 */

export enum MetricType {
  COUNTER = 'counter',
  GAUGE = 'gauge',
  HISTOGRAM = 'histogram',
  SUMMARY = 'summary'
}

export enum MetricCategory {
  PERFORMANCE = 'performance',
  RESOURCE = 'resource',
  MODEL = 'model',
  USER = 'user',
  SYSTEM = 'system'
}

export interface MetricDefinition {
  name: string;
  type: MetricType;
  category: MetricCategory;
  description: string;
  unit?: string;
  labels?: string[];
}

export interface MetricValue {
  value: number;
  timestamp: number;
  labels?: Record<string, string>;
}

export interface MetricSummary {
  count: number;
  sum: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  p95: number;
  p99: number;
}

export interface MetricSnapshot {
  definition: MetricDefinition;
  values: MetricValue[];
  summary?: MetricSummary;
}

export interface MetricsReport {
  timestamp: number;
  metrics: Record<string, MetricSnapshot>;
  aggregates: {
    byCategory: Record<MetricCategory, MetricSummary>;
    overall: MetricSummary;
  };
}

export class MetricsCollector {
  private static instance: MetricsCollector;
  private metrics: Map<string, MetricSnapshot> = new Map();
  private subscribers: Set<(report: MetricsReport) => void> = new Set();
  private reportingInterval: number = 60000; // 1 minute
  private maxValuesPerMetric: number = 1000;
  private reportingTimer: ReturnType<typeof setInterval> | null = null;

  private constructor() {
    this.initializeDefaultMetrics();
    this.startReporting();
  }

  static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  /**
   * Record a metric value
   */
  record(name: string, value: number, labels?: Record<string, string>): void {
    const metric = this.metrics.get(name);
    if (!metric) {
      console.warn(`Metric ${name} not found`);
      return;
    }

    const metricValue: MetricValue = {
      value,
      timestamp: Date.now(),
      labels
    };

    metric.values.push(metricValue);

    // Limit the number of stored values
    if (metric.values.length > this.maxValuesPerMetric) {
      metric.values.shift();
    }

    // Update summary for SUMMARY type metrics
    if (metric.definition.type === MetricType.SUMMARY) {
      metric.summary = this.calculateSummary(metric.values.map(v => v.value));
    }
  }

  /**
   * Register a new metric
   */
  registerMetric(definition: MetricDefinition): void {
    if (this.metrics.has(definition.name)) {
      console.warn(`Metric ${definition.name} already exists`);
      return;
    }

    this.metrics.set(definition.name, {
      definition,
      values: []
    });
  }

  /**
   * Subscribe to metrics reports
   */
  subscribe(callback: (report: MetricsReport) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  /**
   * Get current metrics report
   */
  getReport(): MetricsReport {
    const report = this.generateReport();
    return report;
  }

  /**
   * Clear metrics history
   */
  clearHistory(): void {
    this.metrics.forEach(metric => {
      metric.values = [];
      metric.summary = undefined;
    });
  }

  private initializeDefaultMetrics(): void {
    // Performance metrics
    this.registerMetric({
      name: 'completion_latency',
      type: MetricType.HISTOGRAM,
      category: MetricCategory.PERFORMANCE,
      description: 'Code completion response time',
      unit: 'ms'
    });

    this.registerMetric({
      name: 'model_inference_time',
      type: MetricType.HISTOGRAM,
      category: MetricCategory.PERFORMANCE,
      description: 'Model inference time',
      unit: 'ms'
    });

    // Resource metrics
    this.registerMetric({
      name: 'memory_usage',
      type: MetricType.GAUGE,
      category: MetricCategory.RESOURCE,
      description: 'Memory usage',
      unit: 'bytes'
    });

    this.registerMetric({
      name: 'cpu_usage',
      type: MetricType.GAUGE,
      category: MetricCategory.RESOURCE,
      description: 'CPU usage',
      unit: 'percentage'
    });

    // Model metrics
    this.registerMetric({
      name: 'model_accuracy',
      type: MetricType.GAUGE,
      category: MetricCategory.MODEL,
      description: 'Model prediction accuracy',
      unit: 'percentage'
    });

    this.registerMetric({
      name: 'completion_acceptance_rate',
      type: MetricType.GAUGE,
      category: MetricCategory.MODEL,
      description: 'Rate of accepted completions',
      unit: 'percentage'
    });

    // User metrics
    this.registerMetric({
      name: 'completion_requests',
      type: MetricType.COUNTER,
      category: MetricCategory.USER,
      description: 'Number of completion requests'
    });

    this.registerMetric({
      name: 'user_interactions',
      type: MetricType.COUNTER,
      category: MetricCategory.USER,
      description: 'Number of user interactions'
    });

    // System metrics
    this.registerMetric({
      name: 'error_rate',
      type: MetricType.GAUGE,
      category: MetricCategory.SYSTEM,
      description: 'System error rate',
      unit: 'percentage'
    });

    this.registerMetric({
      name: 'system_uptime',
      type: MetricType.GAUGE,
      category: MetricCategory.SYSTEM,
      description: 'System uptime',
      unit: 'seconds'
    });
  }

  private startReporting(): void {
    this.reportingTimer = setInterval(() => {
      const report = this.generateReport();
      this.notifySubscribers(report);
    }, this.reportingInterval);
  }

  private generateReport(): MetricsReport {
    const timestamp = Date.now();
    const metrics: Record<string, MetricSnapshot> = {};
    const categoryAggregates: Record<MetricCategory, number[]> = Object.values(MetricCategory).reduce(
      (acc, category) => ({ ...acc, [category]: [] }),
      {} as Record<MetricCategory, number[]>
    );
    const allValues: number[] = [];

    // Collect metrics and values
    this.metrics.forEach((metric, name) => {
      metrics[name] = { ...metric };
      const values = metric.values.map(v => v.value);
      categoryAggregates[metric.definition.category].push(...values);
      allValues.push(...values);
    });

    // Calculate aggregates
    const aggregates = {
      byCategory: Object.entries(categoryAggregates).reduce(
        (acc, [category, values]) => ({
          ...acc,
          [category]: this.calculateSummary(values)
        }),
        {} as Record<MetricCategory, MetricSummary>
      ),
      overall: this.calculateSummary(allValues)
    };

    return {
      timestamp,
      metrics,
      aggregates
    };
  }

  private calculateSummary(values: number[]): MetricSummary {
    if (values.length === 0) {
      return {
        count: 0,
        sum: 0,
        min: 0,
        max: 0,
        mean: 0,
        median: 0,
        p95: 0,
        p99: 0
      };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const count = values.length;
    const sum = values.reduce((a, b) => a + b, 0);
    const min = sorted[0];
    const max = sorted[count - 1];
    const mean = sum / count;
    const median = this.calculatePercentile(sorted, 50);
    const p95 = this.calculatePercentile(sorted, 95);
    const p99 = this.calculatePercentile(sorted, 99);

    return {
      count,
      sum,
      min,
      max,
      mean,
      median,
      p95,
      p99
    };
  }

  private calculatePercentile(sorted: number[], percentile: number): number {
    if (sorted.length === 0) return 0;
    if (sorted.length === 1) return sorted[0];

    const index = (percentile / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;

    if (upper === lower) return sorted[index];
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }

  private notifySubscribers(report: MetricsReport): void {
    this.subscribers.forEach(subscriber => {
      try {
        subscriber(report);
      } catch (error) {
        console.error('Error in metrics subscriber:', error);
      }
    });
  }

  dispose(): void {
    if (this.reportingTimer) {
      clearInterval(this.reportingTimer);
      this.reportingTimer = null;
    }
    this.subscribers.clear();
    this.metrics.clear();
  }
}

// Export singleton instance
export const metricsCollector = MetricsCollector.getInstance();

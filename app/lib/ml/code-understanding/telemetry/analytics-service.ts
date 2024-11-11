/**
 * Analytics Service
 * 
 * Provides aggregation and analysis of telemetry data:
 * 1. Metrics aggregation
 * 2. Performance analysis
 * 3. Usage patterns
 * 4. Trend detection
 * 5. Insights generation
 */

import { metricsCollector, MetricCategory, type MetricsReport } from './metrics-collector';
import { performanceTracker, OperationType, type PerformanceRecommendation } from './performance-tracker';

export interface AnalyticsPeriod {
  start: number;
  end: number;
}

export interface TrendData {
  metric: string;
  values: number[];
  trend: 'increasing' | 'decreasing' | 'stable';
  changeRate: number;
}

export interface UsagePattern {
  pattern: string;
  frequency: number;
  correlation: number;
  impact: 'positive' | 'negative' | 'neutral';
}

export interface PerformanceInsight {
  category: string;
  metric: string;
  value: number;
  threshold: number;
  status: 'good' | 'warning' | 'critical';
  trend: TrendData;
  recommendations: string[];
}

export interface AnalyticsReport {
  period: AnalyticsPeriod;
  metrics: MetricsReport;
  performance: PerformanceRecommendation[];
  trends: TrendData[];
  patterns: UsagePattern[];
  insights: PerformanceInsight[];
}

export class AnalyticsService {
  private static instance: AnalyticsService;
  private subscribers: Set<(report: AnalyticsReport) => void>;
  private historicalData: AnalyticsReport[];
  private maxHistorySize: number;
  private analysisInterval: ReturnType<typeof setInterval> | null;

  private constructor() {
    this.subscribers = new Set();
    this.historicalData = [];
    this.maxHistorySize = 100;
    this.analysisInterval = null;
    this.initialize();
  }

  static getInstance(): AnalyticsService {
    if (!AnalyticsService.instance) {
      AnalyticsService.instance = new AnalyticsService();
    }
    return AnalyticsService.instance;
  }

  /**
   * Get analytics report for a specific period
   */
  getReport(period?: Partial<AnalyticsPeriod>): AnalyticsReport {
    const now = Date.now();
    const defaultPeriod = {
      start: now - 24 * 60 * 60 * 1000, // Last 24 hours
      end: now
    };

    const actualPeriod = {
      ...defaultPeriod,
      ...period
    };

    return this.generateReport(actualPeriod);
  }

  /**
   * Subscribe to analytics reports
   */
  subscribe(callback: (report: AnalyticsReport) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  /**
   * Get historical trends
   */
  getTrends(metric: string, period?: AnalyticsPeriod): TrendData {
    const relevantData = this.getRelevantData(period);
    return this.analyzeTrend(metric, relevantData);
  }

  /**
   * Get usage patterns
   */
  getPatterns(period?: AnalyticsPeriod): UsagePattern[] {
    const relevantData = this.getRelevantData(period);
    return this.analyzePatterns(relevantData);
  }

  /**
   * Get performance insights
   */
  getInsights(period?: AnalyticsPeriod): PerformanceInsight[] {
    const relevantData = this.getRelevantData(period);
    return this.generateInsights(relevantData);
  }

  dispose(): void {
    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = null;
    }
    this.subscribers.clear();
    this.historicalData = [];
  }

  private initialize(): void {
    // Subscribe to metrics collector
    metricsCollector.subscribe(metrics => {
      this.processMetricsUpdate(metrics);
    });

    // Subscribe to performance tracker
    performanceTracker.subscribe(recommendations => {
      this.processPerformanceUpdate(recommendations);
    });

    // Start periodic analysis
    this.analysisInterval = setInterval(() => {
      const report = this.generateReport();
      this.notifySubscribers(report);
    }, 300000); // Every 5 minutes
  }

  private generateReport(period?: AnalyticsPeriod): AnalyticsReport {
    const metrics = metricsCollector.getReport();
    const performance = performanceTracker.getAnalysis();
    const relevantData = this.getRelevantData(period);

    return {
      period: period || {
        start: Date.now() - 24 * 60 * 60 * 1000,
        end: Date.now()
      },
      metrics,
      performance,
      trends: this.analyzeAllTrends(relevantData),
      patterns: this.analyzePatterns(relevantData),
      insights: this.generateInsights(relevantData)
    };
  }

  private processMetricsUpdate(metrics: MetricsReport): void {
    const report = this.generateReport();
    this.addToHistory(report);
  }

  private processPerformanceUpdate(recommendations: PerformanceRecommendation[]): void {
    const report = this.generateReport();
    this.addToHistory(report);
  }

  private addToHistory(report: AnalyticsReport): void {
    this.historicalData.push(report);
    if (this.historicalData.length > this.maxHistorySize) {
      this.historicalData.shift();
    }
  }

  private getRelevantData(period?: AnalyticsPeriod): AnalyticsReport[] {
    if (!period) return this.historicalData;

    return this.historicalData.filter(report =>
      report.period.start >= period.start && report.period.end <= period.end
    );
  }

  private analyzeAllTrends(data: AnalyticsReport[]): TrendData[] {
    const trends: TrendData[] = [];

    // Analyze trends for each metric category
    Object.values(MetricCategory).forEach(category => {
      const metrics = data[0]?.metrics.metrics || {};
      Object.keys(metrics).forEach(metricName => {
        if (metrics[metricName].definition.category === category) {
          trends.push(this.analyzeTrend(metricName, data));
        }
      });
    });

    // Analyze trends for each operation type
    Object.values(OperationType).forEach(operation => {
      trends.push(this.analyzeTrend(`${operation}_duration`, data));
    });

    return trends;
  }

  private analyzeTrend(metric: string, data: AnalyticsReport[]): TrendData {
    const values = data.map(report => {
      const metricData = report.metrics.metrics[metric];
      return metricData?.summary?.mean || 0;
    });

    const changeRate = this.calculateChangeRate(values);
    const trend = this.determineTrend(changeRate);

    return {
      metric,
      values,
      trend,
      changeRate
    };
  }

  private calculateChangeRate(values: number[]): number {
    if (values.length < 2) return 0;
    const first = values[0];
    const last = values[values.length - 1];
    return first === 0 ? 0 : (last - first) / first;
  }

  private determineTrend(changeRate: number): 'increasing' | 'decreasing' | 'stable' {
    const threshold = 0.1; // 10% change threshold
    if (changeRate > threshold) return 'increasing';
    if (changeRate < -threshold) return 'decreasing';
    return 'stable';
  }

  private analyzePatterns(data: AnalyticsReport[]): UsagePattern[] {
    const patterns: UsagePattern[] = [];

    // Analyze operation sequences
    const operationSequences = this.findOperationSequences(data);
    patterns.push(...this.analyzeOperationPatterns(operationSequences));

    // Analyze metric correlations
    const metricCorrelations = this.findMetricCorrelations(data);
    patterns.push(...this.analyzeMetricPatterns(metricCorrelations));

    return patterns;
  }

  private findOperationSequences(data: AnalyticsReport[]): string[][] {
    // Extract operation sequences from performance data
    return data.map(report =>
      report.performance.map(rec => rec.operation)
    );
  }

  private findMetricCorrelations(data: AnalyticsReport[]): Array<[string, string, number]> {
    const correlations: Array<[string, string, number]> = [];
    const metrics = data[0]?.metrics.metrics || {};

    // Calculate correlations between pairs of metrics
    Object.keys(metrics).forEach(metric1 => {
      Object.keys(metrics).forEach(metric2 => {
        if (metric1 !== metric2) {
          const correlation = this.calculateCorrelation(
            data.map(report => report.metrics.metrics[metric1]?.summary?.mean || 0),
            data.map(report => report.metrics.metrics[metric2]?.summary?.mean || 0)
          );
          correlations.push([metric1, metric2, correlation]);
        }
      });
    });

    return correlations;
  }

  private calculateCorrelation(values1: number[], values2: number[]): number {
    // Pearson correlation coefficient
    const mean1 = values1.reduce((a, b) => a + b, 0) / values1.length;
    const mean2 = values2.reduce((a, b) => a + b, 0) / values2.length;

    const variance1 = values1.reduce((a, b) => a + Math.pow(b - mean1, 2), 0);
    const variance2 = values2.reduce((a, b) => a + Math.pow(b - mean2, 2), 0);

    const covariance = values1.reduce((a, b, i) => 
      a + (b - mean1) * (values2[i] - mean2), 0
    );

    return covariance / Math.sqrt(variance1 * variance2);
  }

  private analyzeOperationPatterns(sequences: string[][]): UsagePattern[] {
    // Find common operation sequences and their impact
    const patterns: UsagePattern[] = [];
    const sequenceFrequency = new Map<string, number>();

    sequences.forEach(sequence => {
      const sequenceStr = sequence.join(',');
      sequenceFrequency.set(
        sequenceStr,
        (sequenceFrequency.get(sequenceStr) || 0) + 1
      );
    });

    sequenceFrequency.forEach((frequency, pattern) => {
      patterns.push({
        pattern: `Operation sequence: ${pattern}`,
        frequency,
        correlation: 0, // Calculate correlation with performance metrics
        impact: 'neutral' // Determine impact based on performance data
      });
    });

    return patterns;
  }

  private analyzeMetricPatterns(correlations: Array<[string, string, number]>): UsagePattern[] {
    // Convert strong correlations into patterns
    return correlations
      .filter(([, , correlation]) => Math.abs(correlation) > 0.7)
      .map(([metric1, metric2, correlation]) => ({
        pattern: `Strong correlation between ${metric1} and ${metric2}`,
        frequency: 1,
        correlation,
        impact: correlation > 0 ? 'positive' : 'negative'
      }));
  }

  private generateInsights(data: AnalyticsReport[]): PerformanceInsight[] {
    const insights: PerformanceInsight[] = [];

    // Generate insights for each metric category
    Object.values(MetricCategory).forEach(category => {
      const categoryMetrics = this.getCategoryMetrics(category, data);
      insights.push(...this.generateCategoryInsights(category, categoryMetrics, data));
    });

    // Generate insights for each operation type
    Object.values(OperationType).forEach(operation => {
      const operationMetrics = this.getOperationMetrics(operation, data);
      insights.push(...this.generateOperationInsights(operation, operationMetrics, data));
    });

    return insights;
  }

  private getCategoryMetrics(category: MetricCategory, data: AnalyticsReport[]): any[] {
    return data.map(report => report.metrics.aggregates.byCategory[category]);
  }

  private getOperationMetrics(operation: OperationType, data: AnalyticsReport[]): any[] {
    return data.map(report =>
      report.metrics.metrics[`${operation}_duration`]?.summary || null
    ).filter(Boolean);
  }

  private generateCategoryInsights(
    category: string,
    metrics: any[],
    data: AnalyticsReport[]
  ): PerformanceInsight[] {
    const insights: PerformanceInsight[] = [];
    const latestMetrics = metrics[metrics.length - 1];

    if (latestMetrics) {
      const trend = this.analyzeTrend(category, data);
      insights.push({
        category,
        metric: 'mean',
        value: latestMetrics.mean,
        threshold: this.getThresholdForCategory(category),
        status: this.determineStatus(latestMetrics.mean, category),
        trend,
        recommendations: this.generateRecommendations(category, latestMetrics, trend)
      });
    }

    return insights;
  }

  private generateOperationInsights(
    operation: string,
    metrics: any[],
    data: AnalyticsReport[]
  ): PerformanceInsight[] {
    const insights: PerformanceInsight[] = [];
    const latestMetrics = metrics[metrics.length - 1];

    if (latestMetrics) {
      const trend = this.analyzeTrend(`${operation}_duration`, data);
      insights.push({
        category: 'operation',
        metric: operation,
        value: latestMetrics.mean,
        threshold: this.getThresholdForOperation(operation as OperationType),
        status: this.determineStatus(latestMetrics.mean, operation),
        trend,
        recommendations: this.generateRecommendations(operation, latestMetrics, trend)
      });
    }

    return insights;
  }

  private getThresholdForCategory(category: string): number {
    // Define thresholds for different categories
    const thresholds: Record<string, number> = {
      [MetricCategory.PERFORMANCE]: 100,
      [MetricCategory.RESOURCE]: 80,
      [MetricCategory.MODEL]: 90,
      [MetricCategory.USER]: 95,
      [MetricCategory.SYSTEM]: 85
    };

    return thresholds[category] || 90;
  }

  private getThresholdForOperation(operation: OperationType): number {
    return performanceTracker['thresholds'][operation]?.warning || 100;
  }

  private determineStatus(value: number, context: string): 'good' | 'warning' | 'critical' {
    const threshold = this.getThresholdForCategory(context);
    if (value > threshold * 1.5) return 'critical';
    if (value > threshold) return 'warning';
    return 'good';
  }

  private generateRecommendations(
    context: string,
    metrics: any,
    trend: TrendData
  ): string[] {
    const recommendations: string[] = [];

    if (trend.trend === 'increasing') {
      recommendations.push(`Monitor increasing trend in ${context}`);
    }

    if (metrics.mean > this.getThresholdForCategory(context)) {
      recommendations.push(`Optimize ${context} performance`);
    }

    return recommendations;
  }

  private notifySubscribers(report: AnalyticsReport): void {
    this.subscribers.forEach(subscriber => {
      try {
        subscriber(report);
      } catch (error) {
        console.error('Error in analytics subscriber:', error);
      }
    });
  }
}

// Export singleton instance
export const analyticsService = AnalyticsService.getInstance();

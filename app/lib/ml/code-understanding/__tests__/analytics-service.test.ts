import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AnalyticsService,
  analyticsService,
  type AnalyticsPeriod
} from '../telemetry/analytics-service';
import { metricsCollector, MetricCategory } from '../telemetry/metrics-collector';
import { performanceTracker, OperationType } from '../telemetry/performance-tracker';

describe('AnalyticsService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    metricsCollector.clearHistory();
  });

  afterEach(() => {
    vi.useRealTimers();
    analyticsService.dispose();
  });

  describe('Report Generation', () => {
    it('should generate analytics report', () => {
      const report = analyticsService.getReport();

      expect(report).toBeDefined();
      expect(report.period).toBeDefined();
      expect(report.metrics).toBeDefined();
      expect(report.performance).toBeDefined();
      expect(report.trends).toBeDefined();
      expect(report.patterns).toBeDefined();
      expect(report.insights).toBeDefined();
    });

    it('should respect custom time periods', () => {
      const period: AnalyticsPeriod = {
        start: Date.now() - 3600000, // 1 hour ago
        end: Date.now()
      };

      const report = analyticsService.getReport(period);
      expect(report.period).toEqual(period);
    });

    it('should include metrics from collector', () => {
      // Record some metrics
      metricsCollector.record('model_inference_time', 100);
      metricsCollector.record('completion_latency', 150);

      const report = analyticsService.getReport();
      expect(report.metrics.metrics['model_inference_time']).toBeDefined();
      expect(report.metrics.metrics['completion_latency']).toBeDefined();
    });

    it('should include performance recommendations', () => {
      // Simulate slow operation
      const context = {
        component: 'TestComponent',
        operation: OperationType.MODEL_INFERENCE
      };

      performanceTracker.setThresholds(OperationType.MODEL_INFERENCE, {
        warning: 50,
        critical: 100
      });

      const id = performanceTracker.startOperation(context);
      vi.advanceTimersByTime(150); // Exceed critical threshold
      performanceTracker.endOperation(id, context);

      const report = analyticsService.getReport();
      expect(report.performance).toHaveLength(1);
      expect(report.performance[0].severity).toBe('critical');
    });
  });

  describe('Trend Analysis', () => {
    it('should detect increasing trends', () => {
      // Simulate increasing metric values
      for (let i = 0; i < 5; i++) {
        metricsCollector.record('model_inference_time', 100 + i * 20);
        vi.advanceTimersByTime(60000); // Advance 1 minute
      }

      const trend = analyticsService.getTrends('model_inference_time');
      expect(trend.trend).toBe('increasing');
      expect(trend.changeRate).toBeGreaterThan(0);
    });

    it('should detect decreasing trends', () => {
      // Simulate decreasing metric values
      for (let i = 0; i < 5; i++) {
        metricsCollector.record('model_inference_time', 200 - i * 20);
        vi.advanceTimersByTime(60000);
      }

      const trend = analyticsService.getTrends('model_inference_time');
      expect(trend.trend).toBe('decreasing');
      expect(trend.changeRate).toBeLessThan(0);
    });

    it('should identify stable metrics', () => {
      // Simulate stable metric values
      for (let i = 0; i < 5; i++) {
        metricsCollector.record('model_inference_time', 100);
        vi.advanceTimersByTime(60000);
      }

      const trend = analyticsService.getTrends('model_inference_time');
      expect(trend.trend).toBe('stable');
      expect(Math.abs(trend.changeRate)).toBeLessThan(0.1);
    });
  });

  describe('Pattern Detection', () => {
    it('should identify usage patterns', () => {
      // Simulate repeated operation sequence
      const sequence = [
        OperationType.MODEL_INFERENCE,
        OperationType.CODE_COMPLETION
      ];

      // Repeat sequence multiple times
      for (let i = 0; i < 3; i++) {
        sequence.forEach(operation => {
          const context = {
            component: 'TestComponent',
            operation
          };
          const id = performanceTracker.startOperation(context);
          vi.advanceTimersByTime(50);
          performanceTracker.endOperation(id, context);
        });
      }

      const patterns = analyticsService.getPatterns();
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0].frequency).toBeGreaterThan(1);
    });

    it('should detect metric correlations', () => {
      // Simulate correlated metrics
      for (let i = 0; i < 5; i++) {
        metricsCollector.record('model_inference_time', 100 + i * 10);
        metricsCollector.record('completion_latency', 150 + i * 10);
        vi.advanceTimersByTime(60000);
      }

      const patterns = analyticsService.getPatterns();
      const correlationPattern = patterns.find(p => 
        p.pattern.includes('correlation')
      );
      expect(correlationPattern).toBeDefined();
      expect(Math.abs(correlationPattern!.correlation)).toBeGreaterThan(0.7);
    });
  });

  describe('Performance Insights', () => {
    it('should generate insights for metrics', () => {
      // Record metrics exceeding thresholds
      metricsCollector.record('model_inference_time', 200);
      metricsCollector.record('completion_latency', 300);

      const insights = analyticsService.getInsights();
      expect(insights.length).toBeGreaterThan(0);
      expect(insights[0].status).toBe('warning');
      expect(insights[0].recommendations.length).toBeGreaterThan(0);
    });

    it('should categorize insights by severity', () => {
      // Record metrics with different severities
      metricsCollector.record('model_inference_time', 300); // Critical
      metricsCollector.record('completion_latency', 150); // Warning
      metricsCollector.record('file_indexing_time', 50); // Good

      const insights = analyticsService.getInsights();
      const severities = insights.map(i => i.status);
      expect(severities).toContain('critical');
      expect(severities).toContain('warning');
      expect(severities).toContain('good');
    });

    it('should include trend information in insights', () => {
      // Simulate trend
      for (let i = 0; i < 5; i++) {
        metricsCollector.record('model_inference_time', 100 + i * 20);
        vi.advanceTimersByTime(60000);
      }

      const insights = analyticsService.getInsights();
      const insight = insights.find(i => i.metric === 'model_inference_time');
      expect(insight?.trend).toBeDefined();
      expect(insight?.trend.trend).toBe('increasing');
    });
  });

  describe('Subscription Management', () => {
    it('should notify subscribers of new reports', () => {
      const subscriber = vi.fn();
      const unsubscribe = analyticsService.subscribe(subscriber);

      // Trigger report generation
      vi.advanceTimersByTime(300000); // 5 minutes

      expect(subscriber).toHaveBeenCalled();
      const report = subscriber.mock.calls[0][0];
      expect(report).toBeDefined();

      unsubscribe();
    });

    it('should handle subscriber errors gracefully', () => {
      const errorSubscriber = vi.fn().mockImplementation(() => {
        throw new Error('Subscriber error');
      });
      const goodSubscriber = vi.fn();

      analyticsService.subscribe(errorSubscriber);
      analyticsService.subscribe(goodSubscriber);

      // Trigger report generation
      vi.advanceTimersByTime(300000);

      expect(goodSubscriber).toHaveBeenCalled();
    });

    it('should stop notifications after unsubscribe', () => {
      const subscriber = vi.fn();
      const unsubscribe = analyticsService.subscribe(subscriber);

      unsubscribe();

      // Trigger report generation
      vi.advanceTimersByTime(300000);

      expect(subscriber).not.toHaveBeenCalled();
    });
  });

  describe('Resource Management', () => {
    it('should clean up resources on dispose', () => {
      const subscriber = vi.fn();
      analyticsService.subscribe(subscriber);

      analyticsService.dispose();

      // Trigger report generation
      vi.advanceTimersByTime(300000);

      expect(subscriber).not.toHaveBeenCalled();
    });

    it('should maintain historical data within limits', () => {
      // Generate many reports
      for (let i = 0; i < 150; i++) {
        metricsCollector.record('test_metric', i);
        vi.advanceTimersByTime(300000);
      }

      const report = analyticsService.getReport();
      expect(report.trends[0].values.length).toBeLessThanOrEqual(100);
    });
  });
});

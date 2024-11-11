import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MetricsCollector,
  MetricType,
  MetricCategory,
  metricsCollector
} from '../telemetry/metrics-collector';

describe('MetricsCollector', () => {
  beforeEach(() => {
    metricsCollector.clearHistory();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Metric Registration', () => {
    it('should register new metrics', () => {
      metricsCollector.registerMetric({
        name: 'test_metric',
        type: MetricType.COUNTER,
        category: MetricCategory.SYSTEM,
        description: 'Test metric'
      });

      const report = metricsCollector.getReport();
      expect(report.metrics['test_metric']).toBeDefined();
    });

    it('should warn on duplicate metric registration', () => {
      const consoleSpy = vi.spyOn(console, 'warn');
      
      metricsCollector.registerMetric({
        name: 'duplicate_metric',
        type: MetricType.COUNTER,
        category: MetricCategory.SYSTEM,
        description: 'First registration'
      });

      metricsCollector.registerMetric({
        name: 'duplicate_metric',
        type: MetricType.COUNTER,
        category: MetricCategory.SYSTEM,
        description: 'Second registration'
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('duplicate_metric already exists')
      );
    });
  });

  describe('Metric Recording', () => {
    it('should record metric values', () => {
      metricsCollector.registerMetric({
        name: 'test_counter',
        type: MetricType.COUNTER,
        category: MetricCategory.SYSTEM,
        description: 'Test counter'
      });

      metricsCollector.record('test_counter', 1);
      metricsCollector.record('test_counter', 2);

      const report = metricsCollector.getReport();
      expect(report.metrics['test_counter'].values).toHaveLength(2);
      expect(report.metrics['test_counter'].values[0].value).toBe(1);
      expect(report.metrics['test_counter'].values[1].value).toBe(2);
    });

    it('should handle labels in metric values', () => {
      metricsCollector.registerMetric({
        name: 'test_labeled',
        type: MetricType.COUNTER,
        category: MetricCategory.SYSTEM,
        description: 'Test labeled metric',
        labels: ['component']
      });

      metricsCollector.record('test_labeled', 1, { component: 'test' });

      const report = metricsCollector.getReport();
      expect(report.metrics['test_labeled'].values[0].labels).toEqual({
        component: 'test'
      });
    });

    it('should limit the number of stored values', () => {
      metricsCollector.registerMetric({
        name: 'test_limit',
        type: MetricType.COUNTER,
        category: MetricCategory.SYSTEM,
        description: 'Test limit'
      });

      // Record more values than maxValuesPerMetric
      for (let i = 0; i < 1100; i++) {
        metricsCollector.record('test_limit', i);
      }

      const report = metricsCollector.getReport();
      expect(report.metrics['test_limit'].values.length).toBeLessThanOrEqual(1000);
    });
  });

  describe('Metric Analysis', () => {
    it('should calculate summary statistics correctly', () => {
      metricsCollector.registerMetric({
        name: 'test_stats',
        type: MetricType.SUMMARY,
        category: MetricCategory.SYSTEM,
        description: 'Test statistics'
      });

      const values = [1, 2, 3, 4, 5];
      values.forEach(value => metricsCollector.record('test_stats', value));

      const report = metricsCollector.getReport();
      const summary = report.metrics['test_stats'].summary;

      expect(summary).toBeDefined();
      expect(summary?.count).toBe(5);
      expect(summary?.sum).toBe(15);
      expect(summary?.min).toBe(1);
      expect(summary?.max).toBe(5);
      expect(summary?.mean).toBe(3);
      expect(summary?.median).toBe(3);
    });

    it('should calculate percentiles correctly', () => {
      metricsCollector.registerMetric({
        name: 'test_percentiles',
        type: MetricType.SUMMARY,
        category: MetricCategory.SYSTEM,
        description: 'Test percentiles'
      });

      // Record 100 values from 1 to 100
      for (let i = 1; i <= 100; i++) {
        metricsCollector.record('test_percentiles', i);
      }

      const report = metricsCollector.getReport();
      const summary = report.metrics['test_percentiles'].summary;

      expect(summary?.p95).toBe(95);
      expect(summary?.p99).toBe(99);
    });

    it('should aggregate metrics by category', () => {
      metricsCollector.registerMetric({
        name: 'test_system_1',
        type: MetricType.COUNTER,
        category: MetricCategory.SYSTEM,
        description: 'Test system metric 1'
      });

      metricsCollector.registerMetric({
        name: 'test_system_2',
        type: MetricType.COUNTER,
        category: MetricCategory.SYSTEM,
        description: 'Test system metric 2'
      });

      metricsCollector.record('test_system_1', 1);
      metricsCollector.record('test_system_2', 2);

      const report = metricsCollector.getReport();
      expect(report.aggregates.byCategory[MetricCategory.SYSTEM]).toBeDefined();
      expect(report.aggregates.byCategory[MetricCategory.SYSTEM].sum).toBe(3);
    });
  });

  describe('Reporting', () => {
    it('should notify subscribers of new reports', () => {
      const subscriber = vi.fn();
      const unsubscribe = metricsCollector.subscribe(subscriber);

      metricsCollector.registerMetric({
        name: 'test_reporting',
        type: MetricType.COUNTER,
        category: MetricCategory.SYSTEM,
        description: 'Test reporting'
      });

      metricsCollector.record('test_reporting', 1);

      // Advance timer to trigger report
      vi.advanceTimersByTime(60000);

      expect(subscriber).toHaveBeenCalled();
      const report = subscriber.mock.calls[0][0];
      expect(report.metrics['test_reporting']).toBeDefined();

      unsubscribe();
    });

    it('should handle subscriber errors gracefully', () => {
      const errorSubscriber = vi.fn().mockImplementation(() => {
        throw new Error('Subscriber error');
      });
      const goodSubscriber = vi.fn();

      metricsCollector.subscribe(errorSubscriber);
      metricsCollector.subscribe(goodSubscriber);

      // Advance timer to trigger report
      vi.advanceTimersByTime(60000);

      expect(goodSubscriber).toHaveBeenCalled();
    });
  });

  describe('Resource Management', () => {
    it('should clean up resources on dispose', () => {
      const subscriber = vi.fn();
      metricsCollector.subscribe(subscriber);

      metricsCollector.dispose();

      // Advance timer to check if subscriber is still called
      vi.advanceTimersByTime(60000);
      expect(subscriber).not.toHaveBeenCalled();
    });

    it('should clear history', () => {
      metricsCollector.registerMetric({
        name: 'test_clear',
        type: MetricType.COUNTER,
        category: MetricCategory.SYSTEM,
        description: 'Test clear'
      });

      metricsCollector.record('test_clear', 1);
      metricsCollector.clearHistory();

      const report = metricsCollector.getReport();
      expect(report.metrics['test_clear'].values).toHaveLength(0);
    });
  });
});

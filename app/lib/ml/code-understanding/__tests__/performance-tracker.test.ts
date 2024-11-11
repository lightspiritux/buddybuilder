import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PerformanceTracker,
  OperationType,
  performanceTracker
} from '../telemetry/performance-tracker';
import { metricsCollector } from '../telemetry/metrics-collector';

describe('PerformanceTracker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    metricsCollector.clearHistory();
  });

  afterEach(() => {
    vi.useRealTimers();
    performanceTracker.dispose();
  });

  describe('Operation Tracking', () => {
    it('should track operation duration', () => {
      const context = {
        component: 'TestComponent',
        operation: OperationType.MODEL_INFERENCE
      };

      const id = performanceTracker.startOperation(context);
      
      // Simulate time passing
      vi.advanceTimersByTime(100);
      
      performanceTracker.endOperation(id, context);

      const analysis = performanceTracker.getAnalysis();
      expect(analysis).toHaveLength(0); // No recommendations yet as duration is within threshold
    });

    it('should warn about missing start time', () => {
      const consoleSpy = vi.spyOn(console, 'warn');
      
      const context = {
        component: 'TestComponent',
        operation: OperationType.MODEL_INFERENCE
      };

      performanceTracker.endOperation('non-existent-id', context);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('No start time found')
      );
    });

    it('should handle operation labels', () => {
      const context = {
        component: 'TestComponent',
        operation: OperationType.MODEL_INFERENCE,
        labels: { model: 'test-model' }
      };

      const id = performanceTracker.startOperation(context);
      performanceTracker.endOperation(id, context);

      const report = metricsCollector.getReport();
      const metric = report.metrics[`${OperationType.MODEL_INFERENCE}_duration`];
      expect(metric.values[0].labels).toEqual(context.labels);
    });
  });

  describe('Performance Analysis', () => {
    it('should generate recommendations for slow operations', () => {
      const context = {
        component: 'TestComponent',
        operation: OperationType.MODEL_INFERENCE
      };

      // Set a lower threshold for testing
      performanceTracker.setThresholds(OperationType.MODEL_INFERENCE, {
        warning: 50,
        critical: 100
      });

      const id = performanceTracker.startOperation(context);
      vi.advanceTimersByTime(150); // Exceed critical threshold
      performanceTracker.endOperation(id, context);

      const recommendations = performanceTracker.getAnalysis();
      expect(recommendations).toHaveLength(1);
      expect(recommendations[0].severity).toBe('critical');
      expect(recommendations[0].operation).toBe(OperationType.MODEL_INFERENCE);
    });

    it('should notify subscribers of performance recommendations', () => {
      const subscriber = vi.fn();
      const unsubscribe = performanceTracker.subscribe(subscriber);

      const context = {
        component: 'TestComponent',
        operation: OperationType.MODEL_INFERENCE
      };

      // Set a lower threshold for testing
      performanceTracker.setThresholds(OperationType.MODEL_INFERENCE, {
        warning: 50,
        critical: 100
      });

      const id = performanceTracker.startOperation(context);
      vi.advanceTimersByTime(150); // Exceed critical threshold
      performanceTracker.endOperation(id, context);

      // Advance timer to trigger analysis
      vi.advanceTimersByTime(60000);

      expect(subscriber).toHaveBeenCalled();
      const recommendations = subscriber.mock.calls[0][0];
      expect(recommendations[0].severity).toBe('critical');

      unsubscribe();
    });

    it('should handle multiple operations of different types', () => {
      const operations = [
        {
          component: 'TestComponent',
          operation: OperationType.MODEL_INFERENCE
        },
        {
          component: 'TestComponent',
          operation: OperationType.CODE_COMPLETION
        }
      ];

      // Set thresholds for testing
      operations.forEach(({ operation }) => {
        performanceTracker.setThresholds(operation, {
          warning: 50,
          critical: 100
        });
      });

      // Start and end operations with different durations
      operations.forEach(context => {
        const id = performanceTracker.startOperation(context);
        vi.advanceTimersByTime(150); // Exceed critical threshold
        performanceTracker.endOperation(id, context);
      });

      const recommendations = performanceTracker.getAnalysis();
      expect(recommendations).toHaveLength(2);
      expect(recommendations.map(r => r.operation)).toEqual(
        operations.map(o => o.operation)
      );
    });
  });

  describe('Threshold Management', () => {
    it('should allow custom thresholds', () => {
      const customThresholds = {
        warning: 25,
        critical: 50
      };

      performanceTracker.setThresholds(
        OperationType.MODEL_INFERENCE,
        customThresholds
      );

      const context = {
        component: 'TestComponent',
        operation: OperationType.MODEL_INFERENCE
      };

      const id = performanceTracker.startOperation(context);
      vi.advanceTimersByTime(40);
      performanceTracker.endOperation(id, context);

      const recommendations = performanceTracker.getAnalysis();
      expect(recommendations).toHaveLength(1);
      expect(recommendations[0].severity).toBe('warning');
    });

    it('should handle different thresholds for different operations', () => {
      performanceTracker.setThresholds(OperationType.MODEL_INFERENCE, {
        warning: 25,
        critical: 50
      });

      performanceTracker.setThresholds(OperationType.CODE_COMPLETION, {
        warning: 50,
        critical: 100
      });

      const operations = [
        {
          component: 'TestComponent',
          operation: OperationType.MODEL_INFERENCE,
          duration: 40
        },
        {
          component: 'TestComponent',
          operation: OperationType.CODE_COMPLETION,
          duration: 40
        }
      ];

      operations.forEach(({ component, operation, duration }) => {
        const id = performanceTracker.startOperation({ component, operation });
        vi.advanceTimersByTime(duration);
        performanceTracker.endOperation(id, { component, operation });
      });

      const recommendations = performanceTracker.getAnalysis();
      expect(recommendations).toHaveLength(1);
      expect(recommendations[0].operation).toBe(OperationType.MODEL_INFERENCE);
    });
  });

  describe('Resource Management', () => {
    it('should clean up resources on dispose', () => {
      const subscriber = vi.fn();
      performanceTracker.subscribe(subscriber);

      performanceTracker.dispose();

      // Advance timer to check if subscriber is still called
      vi.advanceTimersByTime(60000);
      expect(subscriber).not.toHaveBeenCalled();
    });

    it('should handle subscriber errors gracefully', () => {
      const errorSubscriber = vi.fn().mockImplementation(() => {
        throw new Error('Subscriber error');
      });
      const goodSubscriber = vi.fn();

      performanceTracker.subscribe(errorSubscriber);
      performanceTracker.subscribe(goodSubscriber);

      const context = {
        component: 'TestComponent',
        operation: OperationType.MODEL_INFERENCE
      };

      // Set a lower threshold for testing
      performanceTracker.setThresholds(OperationType.MODEL_INFERENCE, {
        warning: 50,
        critical: 100
      });

      const id = performanceTracker.startOperation(context);
      vi.advanceTimersByTime(150);
      performanceTracker.endOperation(id, context);

      // Advance timer to trigger analysis
      vi.advanceTimersByTime(60000);

      expect(goodSubscriber).toHaveBeenCalled();
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorReporter } from '../error/error-reporter';
import { ErrorCategory, ErrorSeverity } from '../error/error-boundary';

describe('ErrorReporter', () => {
  let errorReporter: ErrorReporter;

  beforeEach(() => {
    errorReporter = ErrorReporter.getInstance();
    errorReporter.clearHistory();
  });

  describe('Error Reporting', () => {
    it('should report and track errors', () => {
      const error = new Error('Test error');
      const context = {
        component: 'TestComponent',
        operation: 'test',
        timestamp: Date.now()
      };

      errorReporter.reportError(error, ErrorCategory.SYSTEM, context);

      const metrics = errorReporter.getMetrics();
      expect(metrics.totalErrors).toBe(1);
      expect(metrics.errorsByCategory[ErrorCategory.SYSTEM]).toBe(1);
    });

    it('should categorize errors based on patterns', () => {
      const errors = [
        new Error('Out of memory error'),
        new Error('Network connection failed'),
        new Error('Worker crashed unexpectedly'),
        new Error('Resource pool exhausted')
      ];

      const context = {
        component: 'TestComponent',
        operation: 'test',
        timestamp: Date.now()
      };

      errors.forEach(error => {
        errorReporter.reportError(error, ErrorCategory.SYSTEM, context);
      });

      const analysis = errorReporter.getAnalysis();
      expect(analysis.metrics.totalErrors).toBe(4);
      expect(analysis.recommendations.length).toBeGreaterThan(0);
    });

    it('should limit error history size', () => {
      const context = {
        component: 'TestComponent',
        operation: 'test',
        timestamp: Date.now()
      };

      // Add more errors than the max history size
      for (let i = 0; i < 1100; i++) {
        errorReporter.reportError(
          new Error(`Error ${i}`),
          ErrorCategory.SYSTEM,
          context
        );
      }

      const metrics = errorReporter.getMetrics();
      expect(metrics.totalErrors).toBeLessThanOrEqual(1000); // maxHistorySize
    });
  });

  describe('Error Analysis', () => {
    it('should calculate error metrics correctly', () => {
      const context = {
        component: 'TestComponent',
        operation: 'test',
        timestamp: Date.now()
      };

      // Add errors with different categories and severities
      errorReporter.reportError(
        new Error('Critical error'),
        ErrorCategory.MEMORY,
        context
      );
      errorReporter.reportError(
        new Error('Network error'),
        ErrorCategory.NETWORK,
        context
      );
      errorReporter.reportError(
        new Error('Worker error'),
        ErrorCategory.WORKER,
        context
      );

      const metrics = errorReporter.getMetrics();
      expect(metrics.errorsByCategory[ErrorCategory.MEMORY]).toBe(1);
      expect(metrics.errorsByCategory[ErrorCategory.NETWORK]).toBe(1);
      expect(metrics.errorsByCategory[ErrorCategory.WORKER]).toBe(1);
    });

    it('should identify top errors', () => {
      const context = {
        component: 'TestComponent',
        operation: 'test',
        timestamp: Date.now()
      };

      // Add repeated errors
      for (let i = 0; i < 3; i++) {
        errorReporter.reportError(
          new Error('Common error'),
          ErrorCategory.SYSTEM,
          context
        );
      }
      errorReporter.reportError(
        new Error('Rare error'),
        ErrorCategory.SYSTEM,
        context
      );

      const metrics = errorReporter.getMetrics();
      expect(metrics.topErrors[0].message).toBe('Common error');
      expect(metrics.topErrors[0].count).toBe(3);
    });

    it('should calculate mean time between errors', () => {
      const baseTime = Date.now();
      const interval = 1000; // 1 second

      // Add errors at regular intervals
      for (let i = 0; i < 3; i++) {
        const context = {
          component: 'TestComponent',
          operation: 'test',
          timestamp: baseTime + i * interval
        };
        errorReporter.reportError(
          new Error(`Error ${i}`),
          ErrorCategory.SYSTEM,
          context
        );
      }

      const metrics = errorReporter.getMetrics();
      expect(metrics.meanTimeBetweenErrors).toBe(interval);
    });
  });

  describe('Error Patterns', () => {
    it('should match error patterns correctly', () => {
      const context = {
        component: 'TestComponent',
        operation: 'test',
        timestamp: Date.now()
      };

      errorReporter.addPattern({
        pattern: /custom error pattern/i,
        category: ErrorCategory.SYSTEM,
        severity: ErrorSeverity.HIGH,
        description: 'Custom error',
        suggestedAction: 'Handle custom error'
      });

      errorReporter.reportError(
        new Error('Custom error pattern detected'),
        ErrorCategory.SYSTEM,
        context
      );

      const analysis = errorReporter.getAnalysis();
      expect(analysis.recommendations).toContain(expect.stringContaining('Handle custom error'));
    });

    it('should generate appropriate recommendations', () => {
      const context = {
        component: 'TestComponent',
        operation: 'test',
        timestamp: Date.now()
      };

      // Add errors that should trigger specific recommendations
      errorReporter.reportError(
        new Error('Out of memory error'),
        ErrorCategory.MEMORY,
        context
      );
      errorReporter.reportError(
        new Error('Network timeout'),
        ErrorCategory.NETWORK,
        context
      );

      const analysis = errorReporter.getAnalysis();
      expect(analysis.recommendations).toContain(
        expect.stringContaining('memory optimization')
      );
      expect(analysis.recommendations).toContain(
        expect.stringContaining('network error handling')
      );
    });
  });

  describe('Subscribers', () => {
    it('should notify subscribers of new errors', () => {
      const subscriber = vi.fn();
      const unsubscribe = errorReporter.subscribe(subscriber);

      const error = new Error('Test error');
      const context = {
        component: 'TestComponent',
        operation: 'test',
        timestamp: Date.now()
      };

      errorReporter.reportError(error, ErrorCategory.SYSTEM, context);
      expect(subscriber).toHaveBeenCalled();

      unsubscribe();
      errorReporter.reportError(error, ErrorCategory.SYSTEM, context);
      expect(subscriber).toHaveBeenCalledTimes(1);
    });

    it('should handle subscriber errors gracefully', () => {
      const errorSubscriber = vi.fn().mockImplementation(() => {
        throw new Error('Subscriber error');
      });
      const goodSubscriber = vi.fn();

      errorReporter.subscribe(errorSubscriber);
      errorReporter.subscribe(goodSubscriber);

      const error = new Error('Test error');
      const context = {
        component: 'TestComponent',
        operation: 'test',
        timestamp: Date.now()
      };

      // Should not throw and should call all subscribers
      errorReporter.reportError(error, ErrorCategory.SYSTEM, context);
      expect(goodSubscriber).toHaveBeenCalled();
    });
  });

  describe('Analytics', () => {
    it('should call analytics callback at appropriate intervals', () => {
      const analyticsCallback = vi.fn();
      errorReporter.setAnalyticsCallback(analyticsCallback);

      const context = {
        component: 'TestComponent',
        operation: 'test',
        timestamp: Date.now()
      };

      // First error should trigger analytics
      errorReporter.reportError(
        new Error('Test error'),
        ErrorCategory.SYSTEM,
        context
      );
      expect(analyticsCallback).toHaveBeenCalledTimes(1);

      // Immediate second error should not trigger analytics
      errorReporter.reportError(
        new Error('Test error 2'),
        ErrorCategory.SYSTEM,
        context
      );
      expect(analyticsCallback).toHaveBeenCalledTimes(1);
    });
  });
});

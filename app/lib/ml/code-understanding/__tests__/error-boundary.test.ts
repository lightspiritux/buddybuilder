import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ErrorBoundary,
  ErrorCategory,
  ErrorSeverity,
  type ErrorContext,
  type ErrorReport
} from '../error/error-boundary';

describe('ErrorBoundary', () => {
  let errorBoundary: ErrorBoundary;

  beforeEach(() => {
    errorBoundary = ErrorBoundary.getInstance();
    errorBoundary.clearErrorHistory();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Error Handling', () => {
    it('should handle errors with appropriate severity', async () => {
      const error = new Error('Critical memory error: out of memory');
      const context: ErrorContext = {
        component: 'TestComponent',
        operation: 'test',
        timestamp: Date.now()
      };

      const report = await errorBoundary.handleError(error, ErrorCategory.MEMORY, context);

      expect(report.severity).toBe(ErrorSeverity.CRITICAL);
      expect(report.category).toBe(ErrorCategory.MEMORY);
      expect(report.context).toBe(context);
      expect(report.error).toBe(error);
    });

    it('should maintain error history', async () => {
      const errors = [
        new Error('Error 1'),
        new Error('Error 2'),
        new Error('Error 3')
      ];

      const context: ErrorContext = {
        component: 'TestComponent',
        operation: 'test',
        timestamp: Date.now()
      };

      for (const error of errors) {
        await errorBoundary.handleError(error, ErrorCategory.SYSTEM, context);
      }

      const history = errorBoundary.getErrorHistory();
      expect(history).toHaveLength(3);
      expect(history[0].error).toBe(errors[0]);
      expect(history[1].error).toBe(errors[1]);
      expect(history[2].error).toBe(errors[2]);
    });

    it('should limit error history size', async () => {
      const context: ErrorContext = {
        component: 'TestComponent',
        operation: 'test',
        timestamp: Date.now()
      };

      // Create more errors than maxHistorySize
      for (let i = 0; i < 150; i++) {
        await errorBoundary.handleError(
          new Error(`Error ${i}`),
          ErrorCategory.SYSTEM,
          context
        );
      }

      const history = errorBoundary.getErrorHistory();
      expect(history.length).toBeLessThanOrEqual(100); // maxHistorySize
    });
  });

  describe('Recovery Strategies', () => {
    it('should attempt recovery with matching strategy', async () => {
      const mockStrategy = {
        name: 'test-strategy',
        condition: vi.fn().mockReturnValue(true),
        action: vi.fn().mockResolvedValue(true),
        maxAttempts: 3
      };

      errorBoundary.addRecoveryStrategy(ErrorCategory.SYSTEM, mockStrategy);

      const error = new Error('Test error');
      const context: ErrorContext = {
        component: 'TestComponent',
        operation: 'test',
        timestamp: Date.now()
      };

      const report = await errorBoundary.handleError(error, ErrorCategory.SYSTEM, context);

      expect(mockStrategy.condition).toHaveBeenCalled();
      expect(mockStrategy.action).toHaveBeenCalled();
      expect(report.recoveryAttempted).toBe(true);
      expect(report.recoverySuccessful).toBe(true);
    });

    it('should handle failed recovery attempts', async () => {
      const mockStrategy = {
        name: 'failing-strategy',
        condition: vi.fn().mockReturnValue(true),
        action: vi.fn().mockResolvedValue(false),
        maxAttempts: 3
      };

      errorBoundary.addRecoveryStrategy(ErrorCategory.SYSTEM, mockStrategy);

      const error = new Error('Test error');
      const context: ErrorContext = {
        component: 'TestComponent',
        operation: 'test',
        timestamp: Date.now()
      };

      const report = await errorBoundary.handleError(error, ErrorCategory.SYSTEM, context);

      expect(report.recoveryAttempted).toBe(true);
      expect(report.recoverySuccessful).toBe(false);
    });

    it('should try multiple strategies until success', async () => {
      const mockStrategies = [
        {
          name: 'failing-strategy',
          condition: vi.fn().mockReturnValue(true),
          action: vi.fn().mockResolvedValue(false),
          maxAttempts: 3
        },
        {
          name: 'successful-strategy',
          condition: vi.fn().mockReturnValue(true),
          action: vi.fn().mockResolvedValue(true),
          maxAttempts: 3
        }
      ];

      mockStrategies.forEach(strategy => 
        errorBoundary.addRecoveryStrategy(ErrorCategory.SYSTEM, strategy)
      );

      const error = new Error('Test error');
      const context: ErrorContext = {
        component: 'TestComponent',
        operation: 'test',
        timestamp: Date.now()
      };

      const report = await errorBoundary.handleError(error, ErrorCategory.SYSTEM, context);

      expect(mockStrategies[0].action).toHaveBeenCalled();
      expect(mockStrategies[1].action).toHaveBeenCalled();
      expect(report.recoverySuccessful).toBe(true);
    });
  });

  describe('Event Notifications', () => {
    it('should notify error listeners', async () => {
      const errorCallback = vi.fn();
      const unsubscribe = errorBoundary.onError(errorCallback);

      const error = new Error('Test error');
      const context: ErrorContext = {
        component: 'TestComponent',
        operation: 'test',
        timestamp: Date.now()
      };

      await errorBoundary.handleError(error, ErrorCategory.SYSTEM, context);

      expect(errorCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          error,
          category: ErrorCategory.SYSTEM,
          context
        })
      );

      unsubscribe();
    });

    it('should notify recovery listeners', async () => {
      const recoveryCallback = vi.fn();
      const unsubscribe = errorBoundary.onRecovery(recoveryCallback);

      const mockStrategy = {
        name: 'test-strategy',
        condition: vi.fn().mockReturnValue(true),
        action: vi.fn().mockResolvedValue(true),
        maxAttempts: 3
      };

      errorBoundary.addRecoveryStrategy(ErrorCategory.SYSTEM, mockStrategy);

      const error = new Error('Test error');
      const context: ErrorContext = {
        component: 'TestComponent',
        operation: 'test',
        timestamp: Date.now()
      };

      await errorBoundary.handleError(error, ErrorCategory.SYSTEM, context);

      expect(recoveryCallback).toHaveBeenCalledWith(
        expect.any(Object),
        true
      );

      unsubscribe();
    });
  });

  describe('Default Strategies', () => {
    it('should handle memory errors', async () => {
      const error = new Error('Out of memory error');
      const context: ErrorContext = {
        component: 'TestComponent',
        operation: 'test',
        timestamp: Date.now()
      };

      // Mock global.gc
      global.gc = vi.fn();

      const report = await errorBoundary.handleError(error, ErrorCategory.MEMORY, context);

      expect(global.gc).toHaveBeenCalled();
      expect(report.recoveryAttempted).toBe(true);
    });

    it('should handle worker errors', async () => {
      const error = new Error('Worker error');
      const mockWorker = {
        terminate: vi.fn(),
        initialize: vi.fn().mockResolvedValue(undefined)
      };

      const context: ErrorContext = {
        component: 'TestComponent',
        operation: 'test',
        timestamp: Date.now(),
        data: { worker: mockWorker }
      };

      const report = await errorBoundary.handleError(error, ErrorCategory.WORKER, context);

      expect(mockWorker.terminate).toHaveBeenCalled();
      expect(mockWorker.initialize).toHaveBeenCalled();
      expect(report.recoveryAttempted).toBe(true);
    });

    it('should handle network errors', async () => {
      const error = new TypeError('network error');
      const mockRetry = vi.fn().mockResolvedValue(undefined);
      const context: ErrorContext = {
        component: 'TestComponent',
        operation: 'test',
        timestamp: Date.now(),
        data: { retry: mockRetry }
      };

      const report = await errorBoundary.handleError(error, ErrorCategory.NETWORK, context);

      expect(mockRetry).toHaveBeenCalled();
      expect(report.recoveryAttempted).toBe(true);
    });
  });
});

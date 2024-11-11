import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  retry,
  BackoffStrategy,
  RetryError,
  createRetryWrapper,
  retryWithExponentialBackoff,
  retryWithLinearBackoff,
  retryWithConstantDelay,
  type RetryResult
} from '../error/retry';

describe('Retry Utility', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  describe('Basic Retry Functionality', () => {
    it('should retry failed operations', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Failed'))
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce('success');

      const result = await retry(operation, {
        maxAttempts: 3,
        initialDelay: 100
      });

      expect(operation).toHaveBeenCalledTimes(3);
      expect(result.result).toBe('success');
      expect(result.attempts).toBe(3);
      expect(result.errors).toHaveLength(2);
    });

    it('should throw after max attempts', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Failed'));

      await expect(retry(operation, {
        maxAttempts: 3,
        initialDelay: 100
      })).rejects.toThrow(RetryError);

      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should respect timeout', async () => {
      const operation = vi.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 1000))
      );

      await expect(retry(operation, {
        maxAttempts: 3,
        timeout: 500,
        initialDelay: 100
      })).rejects.toThrow('Operation timeout');
    });
  });

  describe('Backoff Strategies', () => {
    it('should use constant backoff', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce('success');

      const startTime = Date.now();
      vi.setSystemTime(startTime);

      const promise = retry(operation, {
        maxAttempts: 2,
        backoffStrategy: BackoffStrategy.CONSTANT,
        initialDelay: 1000,
        jitter: false
      });

      await vi.advanceTimersByTimeAsync(1000);
      const result = await promise;

      expect(result.totalTime).toBe(1000);
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should use linear backoff', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Failed'))
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce('success');

      const startTime = Date.now();
      vi.setSystemTime(startTime);

      const promise = retry(operation, {
        maxAttempts: 3,
        backoffStrategy: BackoffStrategy.LINEAR,
        initialDelay: 1000,
        jitter: false
      });

      // First retry after 1000ms
      await vi.advanceTimersByTimeAsync(1000);
      // Second retry after 2000ms
      await vi.advanceTimersByTimeAsync(2000);
      const result = await promise;

      expect(result.totalTime).toBe(3000);
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should use exponential backoff', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Failed'))
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce('success');

      const startTime = Date.now();
      vi.setSystemTime(startTime);

      const promise = retry(operation, {
        maxAttempts: 3,
        backoffStrategy: BackoffStrategy.EXPONENTIAL,
        initialDelay: 1000,
        jitter: false
      });

      // First retry after 1000ms
      await vi.advanceTimersByTimeAsync(1000);
      // Second retry after 2000ms
      await vi.advanceTimersByTimeAsync(2000);
      const result = await promise;

      expect(result.totalTime).toBe(3000);
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should respect max delay', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce('success');

      await retry(operation, {
        maxAttempts: 2,
        backoffStrategy: BackoffStrategy.EXPONENTIAL,
        initialDelay: 1000,
        maxDelay: 1500,
        jitter: false
      });

      expect(operation).toHaveBeenCalledTimes(2);
    });
  });

  describe('Retry Conditions', () => {
    it('should only retry on specific conditions', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Retry this'))
        .mockRejectedValueOnce(new Error('Do not retry'))
        .mockResolvedValueOnce('success');

      await expect(retry(operation, {
        maxAttempts: 3,
        initialDelay: 100,
        retryCondition: (error) => error.message.includes('Retry')
      })).rejects.toThrow('Do not retry');

      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should track retry attempts', async () => {
      const attempts: number[] = [];
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce('success');

      await retry(operation, {
        maxAttempts: 2,
        initialDelay: 100,
        onAttempt: (attempt) => attempts.push(attempt)
      });

      expect(attempts).toEqual([1]);
    });
  });

  describe('Method Wrapping', () => {
    it('should wrap class methods with retry functionality', async () => {
      class TestClass {
        private operation = vi.fn()
          .mockRejectedValueOnce(new Error('Failed'))
          .mockResolvedValueOnce('success');

        async testMethod(): Promise<string> {
          return this.operation();
        }
      }

      const instance = new TestClass();
      const wrappedMethod = createRetryWrapper<() => Promise<string>>(
        instance.testMethod.bind(instance),
        { maxAttempts: 2, initialDelay: 100 }
      );

      const result = await wrappedMethod();
      expect(result.result).toBe('success');
      expect(instance['operation']).toHaveBeenCalledTimes(2);
    });

    it('should work with function wrapper', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce('success');

      const wrappedOperation = createRetryWrapper(operation, {
        maxAttempts: 2,
        initialDelay: 100
      });

      const result = await wrappedOperation();

      expect(result.result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });
  });

  describe('Convenience Methods', () => {
    it('should retry with exponential backoff', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce('success');

      const result = await retryWithExponentialBackoff(operation);

      expect(result.result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should retry with linear backoff', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce('success');

      const result = await retryWithLinearBackoff(operation);

      expect(result.result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should retry with constant delay', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce('success');

      const result = await retryWithConstantDelay(operation);

      expect(result.result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Handling', () => {
    it('should include all errors in retry error', async () => {
      const error1 = new Error('Failed 1');
      const error2 = new Error('Failed 2');
      const operation = vi.fn()
        .mockRejectedValueOnce(error1)
        .mockRejectedValueOnce(error2);

      try {
        await retry(operation, { maxAttempts: 2, initialDelay: 100 });
      } catch (error) {
        expect(error).toBeInstanceOf(RetryError);
        if (error instanceof RetryError) {
          expect(error.errors).toContain(error1);
          expect(error.errors).toContain(error2);
          expect(error.attempts).toBe(2);
        }
      }
    });

    it('should handle non-Error rejections', async () => {
      const operation = vi.fn().mockRejectedValue('string error');

      try {
        await retry(operation, { maxAttempts: 1, initialDelay: 100 });
      } catch (error) {
        expect(error).toBeInstanceOf(RetryError);
        if (error instanceof RetryError) {
          expect(error.errors[0].message).toBe('string error');
        }
      }
    });
  });
});

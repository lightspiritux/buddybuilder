/**
 * Retry Utility
 * 
 * Provides configurable retry functionality with:
 * 1. Multiple backoff strategies
 * 2. Customizable retry conditions
 * 3. Progress tracking
 */

export enum BackoffStrategy {
  CONSTANT = 'constant',
  LINEAR = 'linear',
  EXPONENTIAL = 'exponential',
  FIBONACCI = 'fibonacci'
}

export interface RetryConfig {
  maxAttempts: number;
  backoffStrategy: BackoffStrategy;
  initialDelay: number;
  maxDelay?: number;
  timeout?: number;
  jitter?: boolean;
  onAttempt?: (attempt: number, error: Error) => void;
  retryCondition?: (error: Error) => boolean;
}

export interface RetryResult<T> {
  result: T;
  attempts: number;
  totalTime: number;
  errors: Error[];
}

export class RetryError extends Error {
  constructor(
    message: string,
    public attempts: number,
    public errors: Error[]
  ) {
    super(message);
    this.name = 'RetryError';
  }
}

/**
 * Default retry configuration
 */
const DEFAULT_CONFIG: RetryConfig = {
  maxAttempts: 3,
  backoffStrategy: BackoffStrategy.EXPONENTIAL,
  initialDelay: 1000,
  maxDelay: 30000,
  jitter: true,
  retryCondition: () => true
};

/**
 * Retry operation with configurable backoff
 */
export async function retry<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<RetryResult<T>> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const errors: Error[] = [];
  const startTime = Date.now();

  for (let attempt = 1; attempt <= fullConfig.maxAttempts; attempt++) {
    try {
      const result = await Promise.race([
        operation(),
        fullConfig.timeout
          ? new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Operation timeout')), fullConfig.timeout)
            )
          : Promise.resolve(null)
      ]);

      return {
        result: result as T,
        attempts: attempt,
        totalTime: Date.now() - startTime,
        errors
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      errors.push(err);

      if (fullConfig.onAttempt) {
        fullConfig.onAttempt(attempt, err);
      }

      if (attempt === fullConfig.maxAttempts || !fullConfig.retryCondition?.(err)) {
        throw new RetryError(
          `Operation failed after ${attempt} attempts`,
          attempt,
          errors
        );
      }

      await delay(
        calculateDelay(attempt, fullConfig),
        fullConfig.jitter
      );
    }
  }

  // This should never happen due to the throw in the catch block
  throw new Error('Unexpected retry completion');
}

/**
 * Calculate delay based on strategy
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
  let delay: number;

  switch (config.backoffStrategy) {
    case BackoffStrategy.CONSTANT:
      delay = config.initialDelay;
      break;

    case BackoffStrategy.LINEAR:
      delay = config.initialDelay * attempt;
      break;

    case BackoffStrategy.EXPONENTIAL:
      delay = config.initialDelay * Math.pow(2, attempt - 1);
      break;

    case BackoffStrategy.FIBONACCI:
      delay = config.initialDelay * fibonacci(attempt);
      break;

    default:
      delay = config.initialDelay;
  }

  return Math.min(delay, config.maxDelay || Infinity);
}

/**
 * Add jitter to delay
 */
function addJitter(delay: number): number {
  const jitterFactor = 0.5 + Math.random();
  return Math.floor(delay * jitterFactor);
}

/**
 * Delay execution
 */
async function delay(ms: number, useJitter: boolean = false): Promise<void> {
  const actualDelay = useJitter ? addJitter(ms) : ms;
  return new Promise(resolve => setTimeout(resolve, actualDelay));
}

/**
 * Calculate nth Fibonacci number
 */
function fibonacci(n: number): number {
  if (n <= 1) return n;
  let prev = 0, curr = 1;
  for (let i = 2; i <= n; i++) {
    const next = prev + curr;
    prev = curr;
    curr = next;
  }
  return curr;
}

/**
 * Create retry decorator for class methods
 */
export function withRetry(config: Partial<RetryConfig> = {}) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      return retry(() => originalMethod.apply(this, args), config);
    };

    return descriptor;
  };
}

/**
 * Create retry wrapper for functions
 */
export function createRetryWrapper<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  config: Partial<RetryConfig> = {}
): (...args: Parameters<T>) => Promise<RetryResult<Awaited<ReturnType<T>>>> {
  return async (...args: Parameters<T>) => {
    return retry(() => fn(...args), config);
  };
}

/**
 * Retry operation with exponential backoff
 */
export async function retryWithExponentialBackoff<T>(
  operation: () => Promise<T>,
  maxAttempts: number = 3,
  initialDelay: number = 1000
): Promise<RetryResult<T>> {
  return retry(operation, {
    maxAttempts,
    backoffStrategy: BackoffStrategy.EXPONENTIAL,
    initialDelay
  });
}

/**
 * Retry operation with linear backoff
 */
export async function retryWithLinearBackoff<T>(
  operation: () => Promise<T>,
  maxAttempts: number = 3,
  initialDelay: number = 1000
): Promise<RetryResult<T>> {
  return retry(operation, {
    maxAttempts,
    backoffStrategy: BackoffStrategy.LINEAR,
    initialDelay
  });
}

/**
 * Retry operation with constant delay
 */
export async function retryWithConstantDelay<T>(
  operation: () => Promise<T>,
  maxAttempts: number = 3,
  delay: number = 1000
): Promise<RetryResult<T>> {
  return retry(operation, {
    maxAttempts,
    backoffStrategy: BackoffStrategy.CONSTANT,
    initialDelay: delay
  });
}

import { metricsCollector, MetricType, MetricCategory } from '../ml/code-understanding/telemetry/metrics-collector';
import { performanceTracker, OperationType } from '../ml/code-understanding/telemetry/performance-tracker';

interface TokenCountResult {
  count: number;
  cost: number;
}

interface ModelRates {
  [key: string]: {
    inputRate: number;  // Cost per 1K input tokens
    outputRate: number; // Cost per 1K output tokens
  };
}

const MODEL_RATES: ModelRates = {
  'gpt-4': {
    inputRate: 0.03,
    outputRate: 0.06
  },
  'gpt-3.5-turbo': {
    inputRate: 0.0015,
    outputRate: 0.002
  },
  'claude-2': {
    inputRate: 0.008,
    outputRate: 0.024
  }
};

export class TokenCounter {
  private static instance: TokenCounter;

  private constructor() {
    this.initializeMetrics();
  }

  static getInstance(): TokenCounter {
    if (!TokenCounter.instance) {
      TokenCounter.instance = new TokenCounter();
    }
    return TokenCounter.instance;
  }

  countTokens(text: string): number {
    const operationId = performanceTracker.startOperation({
      component: 'TokenCounter',
      operation: OperationType.WORKER_TASK
    });

    try {
      // Simple approximation: words + punctuation
      // For production, use a proper tokenizer like GPT Tokenizer
      const tokens = text.trim().split(/\s+/).length;
      
      metricsCollector.record('token_count_success', 1, {
        category: MetricCategory.SYSTEM
      });

      return tokens;
    } catch (error) {
      metricsCollector.record('token_count_failed', 1, {
        category: MetricCategory.SYSTEM
      });
      throw error;
    } finally {
      performanceTracker.endOperation(operationId, {
        component: 'TokenCounter',
        operation: OperationType.WORKER_TASK
      });
    }
  }

  calculateCost(model: string, inputTokens: number, outputTokens: number): TokenCountResult {
    const operationId = performanceTracker.startOperation({
      component: 'TokenCounter',
      operation: OperationType.WORKER_TASK
    });

    try {
      const rates = MODEL_RATES[model];
      if (!rates) {
        throw new Error(`Unknown model: ${model}`);
      }

      const inputCost = (inputTokens / 1000) * rates.inputRate;
      const outputCost = (outputTokens / 1000) * rates.outputRate;
      const totalCost = inputCost + outputCost;
      const totalTokens = inputTokens + outputTokens;

      metricsCollector.record('cost_calculation_success', 1, {
        category: MetricCategory.SYSTEM
      });

      return {
        count: totalTokens,
        cost: totalCost
      };
    } catch (error) {
      metricsCollector.record('cost_calculation_failed', 1, {
        category: MetricCategory.SYSTEM
      });
      throw error;
    } finally {
      performanceTracker.endOperation(operationId, {
        component: 'TokenCounter',
        operation: OperationType.WORKER_TASK
      });
    }
  }

  getModelRate(model: string): { inputRate: number; outputRate: number } {
    const rates = MODEL_RATES[model];
    if (!rates) {
      throw new Error(`Unknown model: ${model}`);
    }
    return rates;
  }

  private initializeMetrics(): void {
    metricsCollector.registerMetric({
      name: 'token_count_success',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of successful token counting operations'
    });

    metricsCollector.registerMetric({
      name: 'token_count_failed',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of failed token counting operations'
    });

    metricsCollector.registerMetric({
      name: 'cost_calculation_success',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of successful cost calculations'
    });

    metricsCollector.registerMetric({
      name: 'cost_calculation_failed',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of failed cost calculations'
    });
  }
}

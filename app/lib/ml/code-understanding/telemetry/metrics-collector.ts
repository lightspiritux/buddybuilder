export enum MetricType {
  COUNTER = 'counter',
  GAUGE = 'gauge',
  HISTOGRAM = 'histogram'
}

export enum MetricCategory {
  SYSTEM = 'system',
  PERFORMANCE = 'performance',
  USER = 'user'
}

interface MetricDefinition {
  name: string;
  type: MetricType;
  category: MetricCategory;
  description: string;
}

interface MetricOptions {
  category: MetricCategory;
  labels?: Record<string, string>;
}

class MetricsCollector {
  private static instance: MetricsCollector;
  private metrics: Map<string, MetricDefinition>;

  private constructor() {
    this.metrics = new Map();
  }

  static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  registerMetric(definition: MetricDefinition): void {
    if (this.metrics.has(definition.name)) {
      throw new Error(`Metric ${definition.name} already registered`);
    }
    this.metrics.set(definition.name, definition);
  }

  record(name: string, value: number, options: MetricOptions): void {
    const metric = this.metrics.get(name);
    if (!metric) {
      throw new Error(`Metric ${name} not registered`);
    }

    // In a real implementation, this would send the metric to a monitoring system
    console.log(`Recording metric ${name}: ${value}`, options);
  }

  getMetric(name: string): MetricDefinition | undefined {
    return this.metrics.get(name);
  }
}

export const metricsCollector = MetricsCollector.getInstance();

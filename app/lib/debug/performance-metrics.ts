import { metricsCollector, MetricType, MetricCategory } from '../ml/code-understanding/telemetry/metrics-collector';
import { performanceTracker, OperationType } from '../ml/code-understanding/telemetry/performance-tracker';

export interface PerformanceMetric {
  timestamp: number;
  type: string;
  value: number;
  metadata: Record<string, unknown>;
}

export interface SystemMetrics {
  cpu: {
    usage: number;
    temperature: number;
  };
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  network: {
    requestsPerSecond: number;
    latency: number;
    errorRate: number;
  };
  operations: {
    throughput: number;
    responseTime: number;
    errorCount: number;
  };
}

export interface PerformanceSnapshot {
  metrics: SystemMetrics;
  timestamp: number;
  alerts: Array<{
    type: 'warning' | 'error' | 'critical';
    message: string;
    component: string;
  }>;
}

export class PerformanceMetricsService {
  private static instance: PerformanceMetricsService;
  private metrics: PerformanceMetric[] = [];
  private snapshotInterval: number = 60000; // 1 minute
  private retentionPeriod: number = 7 * 24 * 60 * 60 * 1000; // 7 days
  private alertThresholds = {
    cpu: {
      warning: 70,
      critical: 90
    },
    memory: {
      warning: 80,
      critical: 95
    },
    errorRate: {
      warning: 5,
      critical: 10
    },
    responseTime: {
      warning: 1000, // 1 second
      critical: 5000 // 5 seconds
    }
  };

  private constructor() {
    this.initializeMetrics();
    this.startPerformanceMonitoring();
  }

  static getInstance(): PerformanceMetricsService {
    if (!PerformanceMetricsService.instance) {
      PerformanceMetricsService.instance = new PerformanceMetricsService();
    }
    return PerformanceMetricsService.instance;
  }

  async getLatestSnapshot(): Promise<PerformanceSnapshot> {
    const operationId = performanceTracker.startOperation({
      component: 'PerformanceMetricsService',
      operation: OperationType.DATA_PROCESSING
    });

    try {
      const metrics = await this.collectSystemMetrics();
      const alerts = this.generateAlerts(metrics);

      metricsCollector.record('performance_snapshot_success', 1, {
        category: MetricCategory.SYSTEM
      });

      return {
        metrics,
        timestamp: Date.now(),
        alerts
      };
    } catch (error) {
      metricsCollector.record('performance_snapshot_failed', 1, {
        category: MetricCategory.SYSTEM
      });
      throw error;
    } finally {
      performanceTracker.endOperation(operationId, {
        component: 'PerformanceMetricsService',
        operation: OperationType.DATA_PROCESSING
      });
    }
  }

  async getHistoricalData(
    startTime: number,
    endTime: number = Date.now()
  ): Promise<PerformanceMetric[]> {
    return this.metrics.filter(
      metric => metric.timestamp >= startTime && metric.timestamp <= endTime
    );
  }

  async addMetric(metric: Omit<PerformanceMetric, 'timestamp'>): Promise<void> {
    const operationId = performanceTracker.startOperation({
      component: 'PerformanceMetricsService',
      operation: OperationType.DATA_PROCESSING
    });

    try {
      const newMetric = {
        ...metric,
        timestamp: Date.now()
      };

      this.metrics.push(newMetric);
      this.cleanupOldMetrics();

      metricsCollector.record('performance_metric_added', 1, {
        category: MetricCategory.SYSTEM,
        labels: {
          type: metric.type
        }
      });
    } catch (error) {
      metricsCollector.record('performance_metric_failed', 1, {
        category: MetricCategory.SYSTEM
      });
      throw error;
    } finally {
      performanceTracker.endOperation(operationId, {
        component: 'PerformanceMetricsService',
        operation: OperationType.DATA_PROCESSING
      });
    }
  }

  private async collectSystemMetrics(): Promise<SystemMetrics> {
    // In a real implementation, these would be collected from actual system metrics
    // For now, we'll simulate the metrics
    return {
      cpu: {
        usage: Math.random() * 100,
        temperature: 40 + Math.random() * 20
      },
      memory: {
        used: Math.random() * 8 * 1024, // MB
        total: 8 * 1024, // 8GB
        percentage: Math.random() * 100
      },
      network: {
        requestsPerSecond: Math.random() * 100,
        latency: Math.random() * 1000,
        errorRate: Math.random() * 5
      },
      operations: {
        throughput: Math.random() * 1000,
        responseTime: Math.random() * 500,
        errorCount: Math.floor(Math.random() * 10)
      }
    };
  }

  private generateAlerts(metrics: SystemMetrics): PerformanceSnapshot['alerts'] {
    const alerts: PerformanceSnapshot['alerts'] = [];

    // CPU alerts
    if (metrics.cpu.usage >= this.alertThresholds.cpu.critical) {
      alerts.push({
        type: 'critical',
        message: `Critical CPU usage: ${metrics.cpu.usage.toFixed(1)}%`,
        component: 'CPU'
      });
    } else if (metrics.cpu.usage >= this.alertThresholds.cpu.warning) {
      alerts.push({
        type: 'warning',
        message: `High CPU usage: ${metrics.cpu.usage.toFixed(1)}%`,
        component: 'CPU'
      });
    }

    // Memory alerts
    if (metrics.memory.percentage >= this.alertThresholds.memory.critical) {
      alerts.push({
        type: 'critical',
        message: `Critical memory usage: ${metrics.memory.percentage.toFixed(1)}%`,
        component: 'Memory'
      });
    } else if (metrics.memory.percentage >= this.alertThresholds.memory.warning) {
      alerts.push({
        type: 'warning',
        message: `High memory usage: ${metrics.memory.percentage.toFixed(1)}%`,
        component: 'Memory'
      });
    }

    // Error rate alerts
    if (metrics.network.errorRate >= this.alertThresholds.errorRate.critical) {
      alerts.push({
        type: 'critical',
        message: `Critical error rate: ${metrics.network.errorRate.toFixed(1)}%`,
        component: 'Network'
      });
    } else if (metrics.network.errorRate >= this.alertThresholds.errorRate.warning) {
      alerts.push({
        type: 'warning',
        message: `High error rate: ${metrics.network.errorRate.toFixed(1)}%`,
        component: 'Network'
      });
    }

    // Response time alerts
    if (metrics.operations.responseTime >= this.alertThresholds.responseTime.critical) {
      alerts.push({
        type: 'critical',
        message: `Critical response time: ${metrics.operations.responseTime.toFixed(0)}ms`,
        component: 'Operations'
      });
    } else if (metrics.operations.responseTime >= this.alertThresholds.responseTime.warning) {
      alerts.push({
        type: 'warning',
        message: `High response time: ${metrics.operations.responseTime.toFixed(0)}ms`,
        component: 'Operations'
      });
    }

    return alerts;
  }

  private cleanupOldMetrics(): void {
    const cutoffTime = Date.now() - this.retentionPeriod;
    this.metrics = this.metrics.filter(metric => metric.timestamp > cutoffTime);
  }

  private startPerformanceMonitoring(): void {
    setInterval(async () => {
      try {
        const snapshot = await this.getLatestSnapshot();
        this.addMetric({
          type: 'system_metrics',
          value: 1,
          metadata: {
            cpu: snapshot.metrics.cpu,
            memory: snapshot.metrics.memory,
            network: snapshot.metrics.network,
            operations: snapshot.metrics.operations
          }
        });
      } catch (error) {
        console.error('Failed to collect performance metrics:', error);
      }
    }, this.snapshotInterval);
  }

  private initializeMetrics(): void {
    metricsCollector.registerMetric({
      name: 'performance_snapshot_success',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of successful performance snapshots'
    });

    metricsCollector.registerMetric({
      name: 'performance_snapshot_failed',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of failed performance snapshots'
    });

    metricsCollector.registerMetric({
      name: 'performance_metric_added',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of performance metrics added'
    });

    metricsCollector.registerMetric({
      name: 'performance_metric_failed',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of failed performance metric additions'
    });
  }
}

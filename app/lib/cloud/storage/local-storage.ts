import { SyncData } from '../sync-manager';
import { metricsCollector, MetricType, MetricCategory } from '../../ml/code-understanding/telemetry/metrics-collector';
import { performanceTracker, OperationType } from '../../ml/code-understanding/telemetry/performance-tracker';

export class LocalStorage {
  private static instance: LocalStorage;
  private readonly STORAGE_KEY = 'bb_chat_sync_data';

  private constructor() {
    this.initializeMetrics();
  }

  static getInstance(): LocalStorage {
    if (!LocalStorage.instance) {
      LocalStorage.instance = new LocalStorage();
    }
    return LocalStorage.instance;
  }

  async getData(): Promise<SyncData | null> {
    const operationId = performanceTracker.startOperation({
      component: 'LocalStorage',
      operation: OperationType.DATA_PROCESSING
    });

    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      if (!data) {
        return null;
      }

      const parsedData = JSON.parse(data);
      
      // Convert date strings back to Date objects
      this.rehydrateDates(parsedData);

      metricsCollector.record('local_storage_read_success', 1, {
        category: MetricCategory.SYSTEM
      });

      return parsedData;
    } catch (error) {
      metricsCollector.record('local_storage_read_failed', 1, {
        category: MetricCategory.SYSTEM
      });
      throw error;
    } finally {
      performanceTracker.endOperation(operationId, {
        component: 'LocalStorage',
        operation: OperationType.DATA_PROCESSING
      });
    }
  }

  async setData(data: SyncData): Promise<void> {
    const operationId = performanceTracker.startOperation({
      component: 'LocalStorage',
      operation: OperationType.DATA_PROCESSING
    });

    try {
      // Convert Date objects to ISO strings for storage
      const serializedData = JSON.stringify(data, (key, value) => {
        if (value instanceof Date) {
          return value.toISOString();
        }
        return value;
      });

      localStorage.setItem(this.STORAGE_KEY, serializedData);

      metricsCollector.record('local_storage_write_success', 1, {
        category: MetricCategory.SYSTEM
      });
    } catch (error) {
      metricsCollector.record('local_storage_write_failed', 1, {
        category: MetricCategory.SYSTEM
      });
      throw error;
    } finally {
      performanceTracker.endOperation(operationId, {
        component: 'LocalStorage',
        operation: OperationType.DATA_PROCESSING
      });
    }
  }

  async clearData(): Promise<void> {
    const operationId = performanceTracker.startOperation({
      component: 'LocalStorage',
      operation: OperationType.DATA_PROCESSING
    });

    try {
      localStorage.removeItem(this.STORAGE_KEY);

      metricsCollector.record('local_storage_clear_success', 1, {
        category: MetricCategory.SYSTEM
      });
    } catch (error) {
      metricsCollector.record('local_storage_clear_failed', 1, {
        category: MetricCategory.SYSTEM
      });
      throw error;
    } finally {
      performanceTracker.endOperation(operationId, {
        component: 'LocalStorage',
        operation: OperationType.DATA_PROCESSING
      });
    }
  }

  async getBackup(timestamp: number): Promise<SyncData | null> {
    const operationId = performanceTracker.startOperation({
      component: 'LocalStorage',
      operation: OperationType.DATA_PROCESSING
    });

    try {
      const backupKey = `${this.STORAGE_KEY}_backup_${timestamp}`;
      const data = localStorage.getItem(backupKey);
      if (!data) {
        return null;
      }

      const parsedData = JSON.parse(data);
      this.rehydrateDates(parsedData);

      metricsCollector.record('local_storage_backup_read_success', 1, {
        category: MetricCategory.SYSTEM
      });

      return parsedData;
    } catch (error) {
      metricsCollector.record('local_storage_backup_read_failed', 1, {
        category: MetricCategory.SYSTEM
      });
      throw error;
    } finally {
      performanceTracker.endOperation(operationId, {
        component: 'LocalStorage',
        operation: OperationType.DATA_PROCESSING
      });
    }
  }

  async createBackup(data: SyncData): Promise<void> {
    const operationId = performanceTracker.startOperation({
      component: 'LocalStorage',
      operation: OperationType.DATA_PROCESSING
    });

    try {
      const timestamp = Date.now();
      const backupKey = `${this.STORAGE_KEY}_backup_${timestamp}`;

      const serializedData = JSON.stringify(data, (key, value) => {
        if (value instanceof Date) {
          return value.toISOString();
        }
        return value;
      });

      localStorage.setItem(backupKey, serializedData);

      // Keep track of backups
      const backups = JSON.parse(localStorage.getItem(`${this.STORAGE_KEY}_backups`) || '[]');
      backups.push(timestamp);
      localStorage.setItem(`${this.STORAGE_KEY}_backups`, JSON.stringify(backups));

      // Cleanup old backups (keep last 5)
      if (backups.length > 5) {
        const oldBackups = backups.slice(0, -5);
        for (const oldTimestamp of oldBackups) {
          localStorage.removeItem(`${this.STORAGE_KEY}_backup_${oldTimestamp}`);
        }
        localStorage.setItem(
          `${this.STORAGE_KEY}_backups`,
          JSON.stringify(backups.slice(-5))
        );
      }

      metricsCollector.record('local_storage_backup_create_success', 1, {
        category: MetricCategory.SYSTEM
      });
    } catch (error) {
      metricsCollector.record('local_storage_backup_create_failed', 1, {
        category: MetricCategory.SYSTEM
      });
      throw error;
    } finally {
      performanceTracker.endOperation(operationId, {
        component: 'LocalStorage',
        operation: OperationType.DATA_PROCESSING
      });
    }
  }

  async getBackupList(): Promise<number[]> {
    const backups = JSON.parse(localStorage.getItem(`${this.STORAGE_KEY}_backups`) || '[]');
    return backups.sort((a: number, b: number) => b - a); // Most recent first
  }

  private rehydrateDates(data: any): void {
    if (data && typeof data === 'object') {
      for (const key in data) {
        const value = data[key];
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
          data[key] = new Date(value);
        } else if (typeof value === 'object') {
          this.rehydrateDates(value);
        }
      }
    }
  }

  private initializeMetrics(): void {
    metricsCollector.registerMetric({
      name: 'local_storage_read_success',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of successful local storage reads'
    });

    metricsCollector.registerMetric({
      name: 'local_storage_read_failed',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of failed local storage reads'
    });

    metricsCollector.registerMetric({
      name: 'local_storage_write_success',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of successful local storage writes'
    });

    metricsCollector.registerMetric({
      name: 'local_storage_write_failed',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of failed local storage writes'
    });

    metricsCollector.registerMetric({
      name: 'local_storage_clear_success',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of successful local storage clears'
    });

    metricsCollector.registerMetric({
      name: 'local_storage_clear_failed',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of failed local storage clears'
    });

    metricsCollector.registerMetric({
      name: 'local_storage_backup_read_success',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of successful backup reads'
    });

    metricsCollector.registerMetric({
      name: 'local_storage_backup_read_failed',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of failed backup reads'
    });

    metricsCollector.registerMetric({
      name: 'local_storage_backup_create_success',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of successful backup creations'
    });

    metricsCollector.registerMetric({
      name: 'local_storage_backup_create_failed',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of failed backup creations'
    });
  }
}

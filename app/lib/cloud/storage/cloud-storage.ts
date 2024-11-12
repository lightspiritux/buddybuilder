import { SyncData } from '../sync-manager';
import { metricsCollector, MetricType, MetricCategory } from '../../ml/code-understanding/telemetry/metrics-collector';
import { performanceTracker, OperationType } from '../../ml/code-understanding/telemetry/performance-tracker';

export interface CloudStorageConfig {
  endpoint: string;
  apiKey: string;
  retryAttempts: number;
  retryDelay: number;
  timeout: number;
}

export class CloudStorage {
  private static instance: CloudStorage;
  private config: CloudStorageConfig;

  private constructor() {
    this.config = {
      endpoint: process.env.CLOUD_STORAGE_ENDPOINT || '',
      apiKey: process.env.CLOUD_STORAGE_API_KEY || '',
      retryAttempts: 3,
      retryDelay: 1000,
      timeout: 30000
    };

    this.initializeMetrics();
  }

  static getInstance(): CloudStorage {
    if (!CloudStorage.instance) {
      CloudStorage.instance = new CloudStorage();
    }
    return CloudStorage.instance;
  }

  async uploadData(data: SyncData): Promise<void> {
    const operationId = performanceTracker.startOperation({
      component: 'CloudStorage',
      operation: OperationType.DATA_PROCESSING
    });

    try {
      await this.retryOperation(async () => {
        const response = await fetch(`${this.config.endpoint}/sync`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`
          },
          body: JSON.stringify(data)
        });

        if (!response.ok) {
          throw new Error(`Upload failed: ${response.statusText}`);
        }
      });

      metricsCollector.record('cloud_upload_success', 1, {
        category: MetricCategory.SYSTEM
      });
    } catch (error) {
      metricsCollector.record('cloud_upload_failed', 1, {
        category: MetricCategory.SYSTEM
      });
      throw error;
    } finally {
      performanceTracker.endOperation(operationId, {
        component: 'CloudStorage',
        operation: OperationType.DATA_PROCESSING
      });
    }
  }

  async downloadData(): Promise<SyncData | null> {
    const operationId = performanceTracker.startOperation({
      component: 'CloudStorage',
      operation: OperationType.DATA_PROCESSING
    });

    try {
      const data = await this.retryOperation(async () => {
        const response = await fetch(`${this.config.endpoint}/sync`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`
          }
        });

        if (!response.ok) {
          if (response.status === 404) {
            return null;
          }
          throw new Error(`Download failed: ${response.statusText}`);
        }

        const jsonData = await response.json();
        if (!this.validateSyncData(jsonData)) {
          throw new Error('Invalid sync data format');
        }
        return jsonData as SyncData;
      });

      metricsCollector.record('cloud_download_success', 1, {
        category: MetricCategory.SYSTEM
      });

      return data;
    } catch (error) {
      metricsCollector.record('cloud_download_failed', 1, {
        category: MetricCategory.SYSTEM
      });
      throw error;
    } finally {
      performanceTracker.endOperation(operationId, {
        component: 'CloudStorage',
        operation: OperationType.DATA_PROCESSING
      });
    }
  }

  async createBackup(data: SyncData): Promise<string> {
    const operationId = performanceTracker.startOperation({
      component: 'CloudStorage',
      operation: OperationType.DATA_PROCESSING
    });

    try {
      const timestamp = Date.now();
      await this.retryOperation(async () => {
        const response = await fetch(`${this.config.endpoint}/backup/${timestamp}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`
          },
          body: JSON.stringify(data)
        });

        if (!response.ok) {
          throw new Error(`Backup creation failed: ${response.statusText}`);
        }
      });

      metricsCollector.record('cloud_backup_create_success', 1, {
        category: MetricCategory.SYSTEM
      });

      return timestamp.toString();
    } catch (error) {
      metricsCollector.record('cloud_backup_create_failed', 1, {
        category: MetricCategory.SYSTEM
      });
      throw error;
    } finally {
      performanceTracker.endOperation(operationId, {
        component: 'CloudStorage',
        operation: OperationType.DATA_PROCESSING
      });
    }
  }

  async getBackup(timestamp: string): Promise<SyncData | null> {
    const operationId = performanceTracker.startOperation({
      component: 'CloudStorage',
      operation: OperationType.DATA_PROCESSING
    });

    try {
      const data = await this.retryOperation(async () => {
        const response = await fetch(`${this.config.endpoint}/backup/${timestamp}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`
          }
        });

        if (!response.ok) {
          if (response.status === 404) {
            return null;
          }
          throw new Error(`Backup retrieval failed: ${response.statusText}`);
        }

        const jsonData = await response.json();
        if (!this.validateSyncData(jsonData)) {
          throw new Error('Invalid backup data format');
        }
        return jsonData as SyncData;
      });

      metricsCollector.record('cloud_backup_retrieve_success', 1, {
        category: MetricCategory.SYSTEM
      });

      return data;
    } catch (error) {
      metricsCollector.record('cloud_backup_retrieve_failed', 1, {
        category: MetricCategory.SYSTEM
      });
      throw error;
    } finally {
      performanceTracker.endOperation(operationId, {
        component: 'CloudStorage',
        operation: OperationType.DATA_PROCESSING
      });
    }
  }

  async listBackups(): Promise<string[]> {
    const operationId = performanceTracker.startOperation({
      component: 'CloudStorage',
      operation: OperationType.DATA_PROCESSING
    });

    try {
      const backups = await this.retryOperation(async () => {
        const response = await fetch(`${this.config.endpoint}/backups`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`
          }
        });

        if (!response.ok) {
          throw new Error(`Backup listing failed: ${response.statusText}`);
        }

        const jsonData = await response.json();
        if (!Array.isArray(jsonData) || !jsonData.every(item => typeof item === 'string')) {
          throw new Error('Invalid backup list format');
        }
        return jsonData;
      });

      metricsCollector.record('cloud_backup_list_success', 1, {
        category: MetricCategory.SYSTEM
      });

      return backups;
    } catch (error) {
      metricsCollector.record('cloud_backup_list_failed', 1, {
        category: MetricCategory.SYSTEM
      });
      throw error;
    } finally {
      performanceTracker.endOperation(operationId, {
        component: 'CloudStorage',
        operation: OperationType.DATA_PROCESSING
      });
    }
  }

  private validateSyncData(data: unknown): data is SyncData {
    if (!data || typeof data !== 'object') return false;

    const syncData = data as Partial<SyncData>;

    // Check required properties and their types
    if (!Array.isArray(syncData.chatHistory)) return false;
    if (typeof syncData.settings !== 'object' || !syncData.settings) return false;
    if (!Array.isArray(syncData.templates)) return false;
    if (typeof syncData.timestamp !== 'number') return false;

    // Validate chat history structure
    for (const chat of syncData.chatHistory) {
      if (!chat.id || typeof chat.id !== 'string') return false;
      if (!Array.isArray(chat.messages)) return false;
      if (!(chat.createdAt instanceof Date) && typeof chat.createdAt !== 'string') return false;
      if (!(chat.updatedAt instanceof Date) && typeof chat.updatedAt !== 'string') return false;
      if (typeof chat.metadata !== 'object') return false;

      // Validate messages
      for (const message of chat.messages) {
        if (!message.id || typeof message.id !== 'string') return false;
        if (!message.content || typeof message.content !== 'string') return false;
        if (message.role !== 'user' && message.role !== 'assistant') return false;
        if (!(message.timestamp instanceof Date) && typeof message.timestamp !== 'string') return false;
        if (typeof message.metadata !== 'object') return false;
      }
    }

    // Validate templates
    for (const template of syncData.templates) {
      if (!template.id || typeof template.id !== 'string') return false;
      if (!template.content || typeof template.content !== 'string') return false;
      if (typeof template.metadata !== 'object') return false;
    }

    return true;
  }

  private async retryOperation<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        return await Promise.race([
          operation(),
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Operation timed out')), this.config.timeout);
          })
        ]);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < this.config.retryAttempts) {
          await new Promise(resolve => setTimeout(resolve, this.config.retryDelay * attempt));
        }
      }
    }

    throw lastError || new Error('Operation failed after retries');
  }

  private initializeMetrics(): void {
    metricsCollector.registerMetric({
      name: 'cloud_upload_success',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of successful cloud uploads'
    });

    metricsCollector.registerMetric({
      name: 'cloud_upload_failed',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of failed cloud uploads'
    });

    metricsCollector.registerMetric({
      name: 'cloud_download_success',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of successful cloud downloads'
    });

    metricsCollector.registerMetric({
      name: 'cloud_download_failed',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of failed cloud downloads'
    });

    metricsCollector.registerMetric({
      name: 'cloud_backup_create_success',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of successful backup creations'
    });

    metricsCollector.registerMetric({
      name: 'cloud_backup_create_failed',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of failed backup creations'
    });

    metricsCollector.registerMetric({
      name: 'cloud_backup_retrieve_success',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of successful backup retrievals'
    });

    metricsCollector.registerMetric({
      name: 'cloud_backup_retrieve_failed',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of failed backup retrievals'
    });

    metricsCollector.registerMetric({
      name: 'cloud_backup_list_success',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of successful backup listings'
    });

    metricsCollector.registerMetric({
      name: 'cloud_backup_list_failed',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of failed backup listings'
    });
  }
}

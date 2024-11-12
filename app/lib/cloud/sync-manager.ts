import { LocalStorage } from './storage/local-storage';
import { CloudStorage } from './storage/cloud-storage';
import { metricsCollector, MetricType, MetricCategory } from '../ml/code-understanding/telemetry/metrics-collector';
import { performanceTracker, OperationType } from '../ml/code-understanding/telemetry/performance-tracker';

export interface SyncData {
  chatHistory: ChatHistoryItem[];
  settings: UserSettings;
  templates: TemplateData[];
  timestamp: number;
}

interface ChatHistoryItem {
  id: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, unknown>;
}

interface ChatMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  metadata: Record<string, unknown>;
}

interface UserSettings {
  theme: 'light' | 'dark' | 'system';
  fontSize: number;
  language: string;
  notifications: boolean;
  autoSync: boolean;
  [key: string]: unknown;
}

interface TemplateData {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
}

export interface SyncResult {
  success: boolean;
  error?: string;
  timestamp?: number;
  conflicts?: Array<{
    type: 'chatHistory' | 'settings' | 'templates';
    localData: unknown;
    remoteData: unknown;
  }>;
}

export class SyncManager {
  private static instance: SyncManager;
  private localStorage: LocalStorage;
  private cloudStorage: CloudStorage;
  private syncInProgress: boolean;
  private lastSyncTimestamp: number;
  private cachedData: SyncData | null;

  private constructor() {
    this.localStorage = LocalStorage.getInstance();
    this.cloudStorage = CloudStorage.getInstance();
    this.syncInProgress = false;
    this.lastSyncTimestamp = 0;
    this.cachedData = null;
    this.initializeMetrics();
  }

  static getInstance(): SyncManager {
    if (!SyncManager.instance) {
      SyncManager.instance = new SyncManager();
    }
    return SyncManager.instance;
  }

  async sync(): Promise<SyncResult> {
    if (this.syncInProgress) {
      return { success: false, error: 'Sync already in progress' };
    }

    const operationId = performanceTracker.startOperation({
      component: 'SyncManager',
      operation: OperationType.DATA_PROCESSING
    });

    this.syncInProgress = true;

    try {
      // Get local and remote data
      const [localData, remoteData] = await Promise.all([
        this.localStorage.getData(),
        this.cloudStorage.downloadData()
      ]);

      // If no remote data exists, upload local data
      if (!remoteData && localData) {
        await this.cloudStorage.uploadData(localData);
        this.lastSyncTimestamp = Date.now();
        this.cachedData = localData;
        metricsCollector.record('sync_initial_upload_success', 1, {
          category: MetricCategory.SYSTEM
        });
        return { success: true, timestamp: this.lastSyncTimestamp };
      }

      // If no local data exists, download remote data
      if (!localData && remoteData) {
        await this.localStorage.setData(remoteData);
        this.lastSyncTimestamp = Date.now();
        this.cachedData = remoteData;
        metricsCollector.record('sync_initial_download_success', 1, {
          category: MetricCategory.SYSTEM
        });
        return { success: true, timestamp: this.lastSyncTimestamp };
      }

      // If neither exists, nothing to sync
      if (!localData && !remoteData) {
        this.lastSyncTimestamp = Date.now();
        return { success: true, timestamp: this.lastSyncTimestamp };
      }

      // Both exist, merge data
      const { mergedData, conflicts } = this.mergeData(localData!, remoteData!);

      // Save merged data locally and remotely
      await Promise.all([
        this.localStorage.setData(mergedData),
        this.cloudStorage.uploadData(mergedData)
      ]);

      this.lastSyncTimestamp = Date.now();
      this.cachedData = mergedData;

      metricsCollector.record('sync_success', 1, {
        category: MetricCategory.SYSTEM,
        labels: {
          hasConflicts: String(conflicts.length > 0)
        }
      });

      return {
        success: true,
        timestamp: this.lastSyncTimestamp,
        conflicts: conflicts.length > 0 ? conflicts : undefined
      };
    } catch (error) {
      metricsCollector.record('sync_failed', 1, {
        category: MetricCategory.SYSTEM
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    } finally {
      this.syncInProgress = false;
      performanceTracker.endOperation(operationId, {
        component: 'SyncManager',
        operation: OperationType.DATA_PROCESSING
      });
    }
  }

  async getData(): Promise<SyncData | null> {
    if (this.cachedData) {
      return this.cachedData;
    }

    const data = await this.localStorage.getData();
    if (data) {
      this.cachedData = data;
    }
    return data;
  }

  async createBackup(): Promise<string> {
    const operationId = performanceTracker.startOperation({
      component: 'SyncManager',
      operation: OperationType.DATA_PROCESSING
    });

    try {
      const localData = await this.localStorage.getData();
      if (!localData) {
        throw new Error('No local data to backup');
      }

      // Create local and cloud backups
      const timestamp = Date.now().toString();
      await Promise.all([
        this.localStorage.createBackup(localData),
        this.cloudStorage.createBackup(localData)
      ]);

      metricsCollector.record('backup_create_success', 1, {
        category: MetricCategory.SYSTEM
      });

      return timestamp;
    } catch (error) {
      metricsCollector.record('backup_create_failed', 1, {
        category: MetricCategory.SYSTEM
      });
      throw error;
    } finally {
      performanceTracker.endOperation(operationId, {
        component: 'SyncManager',
        operation: OperationType.DATA_PROCESSING
      });
    }
  }

  async restoreFromBackup(timestamp: string): Promise<void> {
    const operationId = performanceTracker.startOperation({
      component: 'SyncManager',
      operation: OperationType.DATA_PROCESSING
    });

    try {
      // Try cloud backup first, fall back to local backup
      const cloudBackup = await this.cloudStorage.getBackup(timestamp);
      const backup = cloudBackup || await this.localStorage.getBackup(timestamp);

      if (!backup) {
        throw new Error('Backup not found');
      }

      // Restore data locally and in cloud
      await Promise.all([
        this.localStorage.setData(backup),
        this.cloudStorage.uploadData(backup)
      ]);

      this.cachedData = backup;

      metricsCollector.record('backup_restore_success', 1, {
        category: MetricCategory.SYSTEM
      });
    } catch (error) {
      metricsCollector.record('backup_restore_failed', 1, {
        category: MetricCategory.SYSTEM
      });
      throw error;
    } finally {
      performanceTracker.endOperation(operationId, {
        component: 'SyncManager',
        operation: OperationType.DATA_PROCESSING
      });
    }
  }

  private mergeData(localData: SyncData, remoteData: SyncData): {
    mergedData: SyncData;
    conflicts: Array<{
      type: 'chatHistory' | 'settings' | 'templates';
      localData: unknown;
      remoteData: unknown;
    }>;
  } {
    const conflicts: Array<{
      type: 'chatHistory' | 'settings' | 'templates';
      localData: unknown;
      remoteData: unknown;
    }> = [];

    // Merge chat history
    const mergedHistory = this.mergeChatHistory(
      localData.chatHistory,
      remoteData.chatHistory,
      conflicts
    );

    // Merge settings (prefer remote unless local is newer)
    const mergedSettings = this.mergeSettings(
      localData.settings,
      remoteData.settings,
      localData.timestamp,
      remoteData.timestamp,
      conflicts
    );

    // Merge templates
    const mergedTemplates = this.mergeTemplates(
      localData.templates,
      remoteData.templates,
      conflicts
    );

    return {
      mergedData: {
        chatHistory: mergedHistory,
        settings: mergedSettings,
        templates: mergedTemplates,
        timestamp: Date.now()
      },
      conflicts
    };
  }

  private mergeChatHistory(
    local: ChatHistoryItem[],
    remote: ChatHistoryItem[],
    conflicts: Array<{
      type: 'chatHistory' | 'settings' | 'templates';
      localData: unknown;
      remoteData: unknown;
    }>
  ): ChatHistoryItem[] {
    const merged = new Map<string, ChatHistoryItem>();

    // Index all chats by ID
    local.forEach(chat => merged.set(chat.id, chat));
    remote.forEach(chat => {
      const localChat = merged.get(chat.id);
      if (localChat) {
        // Chat exists in both, use the newer version
        if (new Date(chat.updatedAt) > new Date(localChat.updatedAt)) {
          merged.set(chat.id, chat);
        } else if (new Date(chat.updatedAt) < new Date(localChat.updatedAt)) {
          // Keep local version but record conflict
          conflicts.push({
            type: 'chatHistory',
            localData: localChat,
            remoteData: chat
          });
        }
      } else {
        // Chat only exists remotely
        merged.set(chat.id, chat);
      }
    });

    return Array.from(merged.values()).sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  private mergeSettings(
    local: UserSettings,
    remote: UserSettings,
    localTimestamp: number,
    remoteTimestamp: number,
    conflicts: Array<{
      type: 'chatHistory' | 'settings' | 'templates';
      localData: unknown;
      remoteData: unknown;
    }>
  ): UserSettings {
    if (localTimestamp > remoteTimestamp) {
      conflicts.push({
        type: 'settings',
        localData: local,
        remoteData: remote
      });
      return local;
    }
    return remote;
  }

  private mergeTemplates(
    local: TemplateData[],
    remote: TemplateData[],
    conflicts: Array<{
      type: 'chatHistory' | 'settings' | 'templates';
      localData: unknown;
      remoteData: unknown;
    }>
  ): TemplateData[] {
    const merged = new Map<string, TemplateData>();

    // Index all templates by ID
    local.forEach(template => merged.set(template.id, template));
    remote.forEach(template => {
      const localTemplate = merged.get(template.id);
      if (localTemplate && localTemplate.content !== template.content) {
        // Template exists in both with different content
        conflicts.push({
          type: 'templates',
          localData: localTemplate,
          remoteData: template
        });
        // Keep local version in case of conflict
        return;
      }
      merged.set(template.id, template);
    });

    return Array.from(merged.values());
  }

  private initializeMetrics(): void {
    metricsCollector.registerMetric({
      name: 'sync_success',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of successful sync operations'
    });

    metricsCollector.registerMetric({
      name: 'sync_failed',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of failed sync operations'
    });

    metricsCollector.registerMetric({
      name: 'sync_initial_upload_success',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of successful initial data uploads'
    });

    metricsCollector.registerMetric({
      name: 'sync_initial_download_success',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of successful initial data downloads'
    });

    metricsCollector.registerMetric({
      name: 'backup_create_success',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of successful backup creations'
    });

    metricsCollector.registerMetric({
      name: 'backup_create_failed',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of failed backup creations'
    });

    metricsCollector.registerMetric({
      name: 'backup_restore_success',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of successful backup restorations'
    });

    metricsCollector.registerMetric({
      name: 'backup_restore_failed',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of failed backup restorations'
    });
  }
}

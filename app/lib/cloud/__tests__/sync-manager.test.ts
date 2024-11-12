import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncManager, SyncData } from '../sync-manager';
import { LocalStorage } from '../storage/local-storage';
import { CloudStorage } from '../storage/cloud-storage';
import { metricsCollector, MetricType, MetricCategory } from '../../ml/code-understanding/telemetry/metrics-collector';
import { performanceTracker, OperationType } from '../../ml/code-understanding/telemetry/performance-tracker';

// Mock local storage
vi.mock('../storage/local-storage', () => ({
  LocalStorage: {
    getInstance: vi.fn(() => ({
      getData: vi.fn(),
      setData: vi.fn(),
      createBackup: vi.fn(),
      getBackup: vi.fn()
    }))
  }
}));

// Mock cloud storage
vi.mock('../storage/cloud-storage', () => ({
  CloudStorage: {
    getInstance: vi.fn(() => ({
      downloadData: vi.fn(),
      uploadData: vi.fn(),
      createBackup: vi.fn(),
      getBackup: vi.fn()
    }))
  }
}));

// Mock metrics collector
vi.mock('../../ml/code-understanding/telemetry/metrics-collector', () => ({
  metricsCollector: {
    record: vi.fn(),
    registerMetric: vi.fn()
  },
  MetricType: {
    COUNTER: 'counter'
  },
  MetricCategory: {
    SYSTEM: 'system'
  }
}));

// Mock performance tracker
vi.mock('../../ml/code-understanding/telemetry/performance-tracker', () => ({
  performanceTracker: {
    startOperation: vi.fn(() => 'operation-id'),
    endOperation: vi.fn()
  },
  OperationType: {
    DATA_PROCESSING: 'data_processing'
  }
}));

describe('SyncManager', () => {
  let syncManager: SyncManager;
  let localStorage: ReturnType<typeof LocalStorage.getInstance>;
  let cloudStorage: ReturnType<typeof CloudStorage.getInstance>;

  const mockSyncData: SyncData = {
    chatHistory: [
      {
        id: 'chat1',
        messages: [
          {
            id: 'msg1',
            content: 'Hello',
            role: 'user',
            timestamp: new Date('2024-01-01'),
            metadata: {}
          }
        ],
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
        metadata: {}
      }
    ],
    settings: {
      theme: 'light',
      fontSize: 14,
      language: 'en',
      notifications: true,
      autoSync: true
    },
    templates: [
      {
        id: 'template1',
        content: 'Template content',
        metadata: {}
      }
    ],
    timestamp: Date.now()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage = LocalStorage.getInstance();
    cloudStorage = CloudStorage.getInstance();
    syncManager = SyncManager.getInstance();
  });

  describe('Initialization', () => {
    it('creates a singleton instance', () => {
      const instance1 = SyncManager.getInstance();
      const instance2 = SyncManager.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('Sync Operations', () => {
    it('prevents concurrent syncs', async () => {
      const syncPromise1 = syncManager.sync();
      const syncPromise2 = syncManager.sync();

      const [result1, result2] = await Promise.all([syncPromise1, syncPromise2]);
      expect(result2.success).toBe(false);
      expect(result2.error).toBe('Sync already in progress');
    });

    it('handles initial upload when no remote data exists', async () => {
      vi.mocked(localStorage.getData).mockResolvedValueOnce(mockSyncData);
      vi.mocked(cloudStorage.downloadData).mockResolvedValueOnce(null);

      const result = await syncManager.sync();

      expect(result.success).toBe(true);
      expect(cloudStorage.uploadData).toHaveBeenCalledWith(mockSyncData);
      expect(vi.mocked(metricsCollector).record).toHaveBeenCalledWith(
        'sync_initial_upload_success',
        1,
        expect.any(Object)
      );
    });

    it('handles initial download when no local data exists', async () => {
      vi.mocked(localStorage.getData).mockResolvedValueOnce(null);
      vi.mocked(cloudStorage.downloadData).mockResolvedValueOnce(mockSyncData);

      const result = await syncManager.sync();

      expect(result.success).toBe(true);
      expect(localStorage.setData).toHaveBeenCalledWith(mockSyncData);
      expect(vi.mocked(metricsCollector).record).toHaveBeenCalledWith(
        'sync_initial_download_success',
        1,
        expect.any(Object)
      );
    });

    it('merges data when both local and remote exist', async () => {
      const localData = { ...mockSyncData, timestamp: Date.now() - 1000 };
      const remoteData = { ...mockSyncData, timestamp: Date.now() };

      vi.mocked(localStorage.getData).mockResolvedValueOnce(localData);
      vi.mocked(cloudStorage.downloadData).mockResolvedValueOnce(remoteData);

      const result = await syncManager.sync();

      expect(result.success).toBe(true);
      expect(localStorage.setData).toHaveBeenCalled();
      expect(cloudStorage.uploadData).toHaveBeenCalled();
    });

    it('handles sync failures', async () => {
      vi.mocked(localStorage.getData).mockRejectedValueOnce(new Error('Storage error'));

      const result = await syncManager.sync();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Storage error');
      expect(vi.mocked(metricsCollector).record).toHaveBeenCalledWith(
        'sync_failed',
        1,
        expect.any(Object)
      );
    });
  });

  describe('Backup Management', () => {
    it('creates backups successfully', async () => {
      vi.mocked(localStorage.getData).mockResolvedValueOnce(mockSyncData);

      const timestamp = await syncManager.createBackup();

      expect(localStorage.createBackup).toHaveBeenCalledWith(mockSyncData);
      expect(cloudStorage.createBackup).toHaveBeenCalledWith(mockSyncData);
      expect(vi.mocked(metricsCollector).record).toHaveBeenCalledWith(
        'backup_create_success',
        1,
        expect.any(Object)
      );
    });

    it('restores from backup successfully', async () => {
      const timestamp = Date.now().toString();
      vi.mocked(cloudStorage.getBackup).mockResolvedValueOnce(mockSyncData);

      await syncManager.restoreFromBackup(timestamp);

      expect(localStorage.setData).toHaveBeenCalledWith(mockSyncData);
      expect(cloudStorage.uploadData).toHaveBeenCalledWith(mockSyncData);
      expect(vi.mocked(metricsCollector).record).toHaveBeenCalledWith(
        'backup_restore_success',
        1,
        expect.any(Object)
      );
    });

    it('falls back to local backup when cloud backup fails', async () => {
      const timestamp = Date.now().toString();
      vi.mocked(cloudStorage.getBackup).mockResolvedValueOnce(null);
      vi.mocked(localStorage.getBackup).mockResolvedValueOnce(mockSyncData);

      await syncManager.restoreFromBackup(timestamp);

      expect(localStorage.setData).toHaveBeenCalledWith(mockSyncData);
      expect(cloudStorage.uploadData).toHaveBeenCalledWith(mockSyncData);
    });

    it('handles backup failures', async () => {
      vi.mocked(localStorage.getData).mockRejectedValueOnce(new Error('Backup error'));

      await expect(syncManager.createBackup()).rejects.toThrow('Backup error');
      expect(vi.mocked(metricsCollector).record).toHaveBeenCalledWith(
        'backup_create_failed',
        1,
        expect.any(Object)
      );
    });

    it('handles restore failures', async () => {
      const timestamp = Date.now().toString();
      vi.mocked(cloudStorage.getBackup).mockResolvedValueOnce(null);
      vi.mocked(localStorage.getBackup).mockResolvedValueOnce(null);

      await expect(syncManager.restoreFromBackup(timestamp)).rejects.toThrow('Backup not found');
      expect(vi.mocked(metricsCollector).record).toHaveBeenCalledWith(
        'backup_restore_failed',
        1,
        expect.any(Object)
      );
    });
  });

  describe('Performance Tracking', () => {
    it('tracks sync operation performance', async () => {
      vi.mocked(localStorage.getData).mockResolvedValueOnce(mockSyncData);
      vi.mocked(cloudStorage.downloadData).mockResolvedValueOnce(null);

      await syncManager.sync();

      expect(vi.mocked(performanceTracker).startOperation).toHaveBeenCalledWith({
        component: 'SyncManager',
        operation: OperationType.DATA_PROCESSING
      });
      expect(vi.mocked(performanceTracker).endOperation).toHaveBeenCalled();
    });
  });

  describe('Metrics Collection', () => {
    it('records successful operations', async () => {
      vi.mocked(localStorage.getData).mockResolvedValueOnce(mockSyncData);
      vi.mocked(cloudStorage.downloadData).mockResolvedValueOnce(null);

      await syncManager.sync();

      expect(vi.mocked(metricsCollector).record).toHaveBeenCalledWith(
        'sync_initial_upload_success',
        1,
        expect.any(Object)
      );
    });

    it('records failed operations', async () => {
      vi.mocked(localStorage.getData).mockRejectedValueOnce(new Error('Sync error'));

      await syncManager.sync();

      expect(vi.mocked(metricsCollector).record).toHaveBeenCalledWith(
        'sync_failed',
        1,
        expect.any(Object)
      );
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalStorage } from '../local-storage';
import { SyncData } from '../../sync-manager';
import { metricsCollector, MetricType, MetricCategory } from '../../../ml/code-understanding/telemetry/metrics-collector';
import { performanceTracker, OperationType } from '../../../ml/code-understanding/telemetry/performance-tracker';

// Mock localStorage
const localStorageMock = (() => {
  let store: { [key: string]: string } = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value.toString();
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    })
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

// Mock metrics collector
vi.mock('../../../ml/code-understanding/telemetry/metrics-collector', () => ({
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
vi.mock('../../../ml/code-understanding/telemetry/performance-tracker', () => ({
  performanceTracker: {
    startOperation: vi.fn(() => 'operation-id'),
    endOperation: vi.fn()
  },
  OperationType: {
    DATA_PROCESSING: 'data_processing'
  }
}));

describe('LocalStorage', () => {
  let localStorage: LocalStorage;
  const mockData: SyncData = {
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
    localStorageMock.clear();
    localStorage = LocalStorage.getInstance();
  });

  describe('Initialization', () => {
    it('creates a singleton instance', () => {
      const instance1 = LocalStorage.getInstance();
      const instance2 = LocalStorage.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('Data Operations', () => {
    it('stores and retrieves data correctly', async () => {
      await localStorage.setData(mockData);
      const retrievedData = await localStorage.getData();

      expect(retrievedData).toEqual(mockData);
      expect(localStorageMock.setItem).toHaveBeenCalled();
      expect(localStorageMock.getItem).toHaveBeenCalled();
    });

    it('handles missing data gracefully', async () => {
      const data = await localStorage.getData();
      expect(data).toBeNull();
    });

    it('clears data correctly', async () => {
      await localStorage.setData(mockData);
      await localStorage.clearData();
      const data = await localStorage.getData();

      expect(data).toBeNull();
      expect(localStorageMock.removeItem).toHaveBeenCalled();
    });

    it('handles storage errors', async () => {
      vi.spyOn(localStorageMock, 'setItem').mockImplementationOnce(() => {
        throw new Error('Storage full');
      });

      await expect(localStorage.setData(mockData)).rejects.toThrow('Storage full');
    });
  });

  describe('Date Handling', () => {
    it('preserves Date objects when storing and retrieving', async () => {
      await localStorage.setData(mockData);
      const retrievedData = await localStorage.getData();

      expect(retrievedData?.chatHistory[0].createdAt).toBeInstanceOf(Date);
      expect(retrievedData?.chatHistory[0].updatedAt).toBeInstanceOf(Date);
      expect(retrievedData?.chatHistory[0].messages[0].timestamp).toBeInstanceOf(Date);
    });

    it('handles invalid date strings gracefully', async () => {
      const invalidData = {
        ...mockData,
        chatHistory: [{
          ...mockData.chatHistory[0],
          createdAt: 'invalid-date'
        }]
      };

      await localStorage.setData(invalidData as any);
      const retrievedData = await localStorage.getData();

      expect(retrievedData?.chatHistory[0].createdAt).not.toBeInstanceOf(Date);
    });
  });

  describe('Backup Management', () => {
    it('creates and retrieves backups', async () => {
      await localStorage.createBackup(mockData);
      const backupList = await localStorage.getBackupList();
      const backup = await localStorage.getBackup(backupList[0]);

      expect(backup).toEqual(mockData);
    });

    it('maintains only the last 5 backups', async () => {
      for (let i = 0; i < 7; i++) {
        await localStorage.createBackup({
          ...mockData,
          timestamp: Date.now() + i
        });
      }

      const backupList = await localStorage.getBackupList();
      expect(backupList.length).toBe(5);
    });

    it('returns backups in reverse chronological order', async () => {
      const timestamps = [1000, 2000, 3000];
      for (const timestamp of timestamps) {
        await localStorage.createBackup({
          ...mockData,
          timestamp
        });
      }

      const backupList = await localStorage.getBackupList();
      expect(backupList).toEqual([3000, 2000, 1000]);
    });

    it('handles missing backups gracefully', async () => {
      const backup = await localStorage.getBackup(123);
      expect(backup).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('handles JSON parse errors', async () => {
      localStorageMock.getItem.mockReturnValueOnce('invalid json');
      await expect(localStorage.getData()).rejects.toThrow();
    });

    it('handles storage quota errors', async () => {
      vi.spyOn(localStorageMock, 'setItem').mockImplementationOnce(() => {
        throw new Error('QuotaExceededError');
      });

      await expect(localStorage.setData(mockData)).rejects.toThrow('QuotaExceededError');
    });

    it('handles storage unavailable errors', async () => {
      vi.spyOn(localStorageMock, 'getItem').mockImplementationOnce(() => {
        throw new Error('Storage unavailable');
      });

      await expect(localStorage.getData()).rejects.toThrow('Storage unavailable');
    });
  });

  describe('Performance Tracking', () => {
    it('tracks read operations', async () => {
      await localStorage.getData();
      expect(vi.mocked(performanceTracker).startOperation).toHaveBeenCalledWith({
        component: 'LocalStorage',
        operation: OperationType.DATA_PROCESSING
      });
      expect(vi.mocked(performanceTracker).endOperation).toHaveBeenCalled();
    });

    it('tracks write operations', async () => {
      await localStorage.setData(mockData);
      expect(vi.mocked(performanceTracker).startOperation).toHaveBeenCalledWith({
        component: 'LocalStorage',
        operation: OperationType.DATA_PROCESSING
      });
      expect(vi.mocked(performanceTracker).endOperation).toHaveBeenCalled();
    });

    it('tracks backup operations', async () => {
      await localStorage.createBackup(mockData);
      expect(vi.mocked(performanceTracker).startOperation).toHaveBeenCalledWith({
        component: 'LocalStorage',
        operation: OperationType.DATA_PROCESSING
      });
      expect(vi.mocked(performanceTracker).endOperation).toHaveBeenCalled();
    });
  });

  describe('Metrics Collection', () => {
    it('records successful operations', async () => {
      await localStorage.setData(mockData);
      expect(vi.mocked(metricsCollector).record).toHaveBeenCalledWith(
        'local_storage_write_success',
        1,
        expect.any(Object)
      );
    });

    it('records failed operations', async () => {
      vi.spyOn(localStorageMock, 'setItem').mockImplementationOnce(() => {
        throw new Error('Storage error');
      });

      try {
        await localStorage.setData(mockData);
      } catch {
        expect(vi.mocked(metricsCollector).record).toHaveBeenCalledWith(
          'local_storage_write_failed',
          1,
          expect.any(Object)
        );
      }
    });
  });
});

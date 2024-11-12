import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CloudStorage, CloudStorageConfig } from '../cloud-storage';
import { SyncData } from '../../sync-manager';
import { metricsCollector, MetricType, MetricCategory } from '../../../ml/code-understanding/telemetry/metrics-collector';
import { performanceTracker, OperationType } from '../../../ml/code-understanding/telemetry/performance-tracker';

// Mock fetch
global.fetch = vi.fn();

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

describe('CloudStorage', () => {
  let cloudStorage: CloudStorage;
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
    cloudStorage = CloudStorage.getInstance();
  });

  describe('Initialization', () => {
    it('creates a singleton instance', () => {
      const instance1 = CloudStorage.getInstance();
      const instance2 = CloudStorage.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('initializes with default configuration', () => {
      const instance = CloudStorage.getInstance();
      expect(instance).toBeDefined();
    });
  });

  describe('Data Upload', () => {
    it('uploads data successfully', async () => {
      const mockResponse = new Response(null, {
        status: 200,
        statusText: 'OK'
      });
      vi.mocked(fetch).mockResolvedValueOnce(mockResponse);

      await cloudStorage.uploadData(mockSyncData);

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/sync'),
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': expect.stringContaining('Bearer ')
          }),
          body: JSON.stringify(mockSyncData)
        })
      );
    });

    it('handles upload failures', async () => {
      const mockResponse = new Response(null, {
        status: 500,
        statusText: 'Internal Server Error'
      });
      vi.mocked(fetch).mockResolvedValueOnce(mockResponse);

      await expect(cloudStorage.uploadData(mockSyncData)).rejects.toThrow('Upload failed');
    });

    it('retries failed uploads', async () => {
      vi.mocked(fetch)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(new Response(null, { status: 200 }));

      await cloudStorage.uploadData(mockSyncData);

      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Data Download', () => {
    it('downloads data successfully', async () => {
      const mockResponse = new Response(JSON.stringify(mockSyncData), {
        status: 200,
        statusText: 'OK',
        headers: { 'Content-Type': 'application/json' }
      });
      vi.mocked(fetch).mockResolvedValueOnce(mockResponse);

      const data = await cloudStorage.downloadData();

      expect(data).toEqual(mockSyncData);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/sync'),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': expect.stringContaining('Bearer ')
          })
        })
      );
    });

    it('handles missing data', async () => {
      const mockResponse = new Response(null, {
        status: 404,
        statusText: 'Not Found'
      });
      vi.mocked(fetch).mockResolvedValueOnce(mockResponse);

      const data = await cloudStorage.downloadData();
      expect(data).toBeNull();
    });

    it('validates downloaded data', async () => {
      const invalidData = { ...mockSyncData, chatHistory: 'not an array' };
      const mockResponse = new Response(JSON.stringify(invalidData), {
        status: 200,
        statusText: 'OK',
        headers: { 'Content-Type': 'application/json' }
      });
      vi.mocked(fetch).mockResolvedValueOnce(mockResponse);

      await expect(cloudStorage.downloadData()).rejects.toThrow('Invalid sync data format');
    });
  });

  describe('Backup Management', () => {
    it('creates backup successfully', async () => {
      const mockResponse = new Response(null, {
        status: 200,
        statusText: 'OK'
      });
      vi.mocked(fetch).mockResolvedValueOnce(mockResponse);

      const timestamp = await cloudStorage.createBackup(mockSyncData);

      expect(timestamp).toMatch(/^\d+$/);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/backup/'),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(mockSyncData)
        })
      );
    });

    it('retrieves backup successfully', async () => {
      const mockResponse = new Response(JSON.stringify(mockSyncData), {
        status: 200,
        statusText: 'OK',
        headers: { 'Content-Type': 'application/json' }
      });
      vi.mocked(fetch).mockResolvedValueOnce(mockResponse);

      const data = await cloudStorage.getBackup('123456789');

      expect(data).toEqual(mockSyncData);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/backup/123456789'),
        expect.any(Object)
      );
    });

    it('lists backups successfully', async () => {
      const mockBackups = ['123456789', '987654321'];
      const mockResponse = new Response(JSON.stringify(mockBackups), {
        status: 200,
        statusText: 'OK',
        headers: { 'Content-Type': 'application/json' }
      });
      vi.mocked(fetch).mockResolvedValueOnce(mockResponse);

      const backups = await cloudStorage.listBackups();

      expect(backups).toEqual(mockBackups);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/backups'),
        expect.any(Object)
      );
    });

    it('validates backup list format', async () => {
      const mockResponse = new Response(JSON.stringify([123, 456]), {
        status: 200,
        statusText: 'OK',
        headers: { 'Content-Type': 'application/json' }
      });
      vi.mocked(fetch).mockResolvedValueOnce(mockResponse);

      await expect(cloudStorage.listBackups()).rejects.toThrow('Invalid backup list format');
    });
  });

  describe('Error Handling', () => {
    it('handles network errors', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

      await expect(cloudStorage.downloadData()).rejects.toThrow('Network error');
    });

    it('handles timeout errors', async () => {
      vi.mocked(fetch).mockImplementationOnce(() => new Promise(() => {})); // Never resolves

      await expect(cloudStorage.downloadData()).rejects.toThrow('Operation timed out');
    });

    it('handles invalid JSON responses', async () => {
      const mockResponse = new Response('invalid json', {
        status: 200,
        statusText: 'OK',
        headers: { 'Content-Type': 'application/json' }
      });
      vi.mocked(fetch).mockResolvedValueOnce(mockResponse);

      await expect(cloudStorage.downloadData()).rejects.toThrow();
    });
  });

  describe('Performance Tracking', () => {
    it('tracks operation performance', async () => {
      const mockResponse = new Response(JSON.stringify(mockSyncData), {
        status: 200,
        statusText: 'OK',
        headers: { 'Content-Type': 'application/json' }
      });
      vi.mocked(fetch).mockResolvedValueOnce(mockResponse);

      await cloudStorage.downloadData();

      expect(vi.mocked(performanceTracker).startOperation).toHaveBeenCalledWith({
        component: 'CloudStorage',
        operation: OperationType.DATA_PROCESSING
      });
      expect(vi.mocked(performanceTracker).endOperation).toHaveBeenCalled();
    });
  });

  describe('Metrics Collection', () => {
    it('records successful operations', async () => {
      const mockResponse = new Response(JSON.stringify(mockSyncData), {
        status: 200,
        statusText: 'OK',
        headers: { 'Content-Type': 'application/json' }
      });
      vi.mocked(fetch).mockResolvedValueOnce(mockResponse);

      await cloudStorage.downloadData();

      expect(vi.mocked(metricsCollector).record).toHaveBeenCalledWith(
        'cloud_download_success',
        1,
        expect.any(Object)
      );
    });

    it('records failed operations', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

      try {
        await cloudStorage.downloadData();
      } catch {
        expect(vi.mocked(metricsCollector).record).toHaveBeenCalledWith(
          'cloud_download_failed',
          1,
          expect.any(Object)
        );
      }
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchService, SearchResult } from '../search-service';
import { ChatSearchIndex } from '../chat-search-index';
import { SyncManager, SyncData } from '../../cloud/sync-manager';
import { metricsCollector } from '../../ml/code-understanding/telemetry/metrics-collector';
import { performanceTracker } from '../../ml/code-understanding/telemetry/performance-tracker';

// Mock chat search index
vi.mock('../chat-search-index', () => ({
  ChatSearchIndex: {
    getInstance: vi.fn(() => ({
      search: vi.fn(),
      addDocument: vi.fn(),
      clear: vi.fn()
    }))
  }
}));

// Mock sync manager
vi.mock('../../cloud/sync-manager', () => ({
  SyncManager: {
    getInstance: vi.fn(() => ({
      sync: vi.fn(),
      getData: vi.fn()
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

describe('SearchService', () => {
  let searchService: SearchService;
  let searchIndex: ReturnType<typeof ChatSearchIndex.getInstance>;
  let syncManager: ReturnType<typeof SyncManager.getInstance>;

  const mockChatData: SyncData = {
    chatHistory: [
      {
        id: 'chat1',
        messages: [
          {
            id: 'msg1',
            content: 'Hello, how can I help you with TypeScript?',
            role: 'assistant' as const,
            timestamp: new Date('2024-01-01T10:00:00Z'),
            metadata: {}
          },
          {
            id: 'msg2',
            content: 'I need help with React components',
            role: 'user' as const,
            timestamp: new Date('2024-01-01T10:01:00Z'),
            metadata: {}
          }
        ],
        createdAt: new Date('2024-01-01T10:00:00Z'),
        updatedAt: new Date('2024-01-01T10:01:00Z'),
        metadata: { topic: 'development' }
      }
    ],
    settings: {
      theme: 'light' as const,
      fontSize: 14,
      language: 'en',
      notifications: true,
      autoSync: true
    },
    templates: [],
    timestamp: Date.now()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    searchIndex = ChatSearchIndex.getInstance();
    syncManager = SyncManager.getInstance();
    searchService = SearchService.getInstance();
  });

  describe('Initialization', () => {
    it('creates a singleton instance', () => {
      const instance1 = SearchService.getInstance();
      const instance2 = SearchService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('Search Operations', () => {
    it('performs basic search', async () => {
      const mockSearchResults: SearchResult[] = [{
        document: {
          id: 'msg1',
          content: 'Hello, how can I help you with TypeScript?',
          type: 'message',
          timestamp: new Date('2024-01-01T10:00:00Z'),
          metadata: { role: 'assistant' }
        },
        score: 1.0,
        highlights: [
          {
            field: 'content',
            snippet: 'Hello, how can I help you with TypeScript?',
            positions: [[0, 5] as [number, number]]
          }
        ]
      }];

      vi.mocked(syncManager.sync).mockResolvedValueOnce({
        success: true,
        timestamp: Date.now()
      });
      vi.mocked(searchIndex.search).mockResolvedValueOnce(mockSearchResults);

      const results = await searchService.search({ query: 'TypeScript' });

      expect(results).toHaveLength(1);
      expect(results[0].document.content).toContain('TypeScript');
      expect(searchIndex.search).toHaveBeenCalledWith(
        'TypeScript',
        expect.any(Object)
      );
    });

    it('applies search filters', async () => {
      vi.mocked(syncManager.sync).mockResolvedValueOnce({
        success: true,
        timestamp: Date.now()
      });

      await searchService.search({
        query: 'TypeScript',
        filters: {
          type: 'message',
          role: 'assistant',
          fromDate: new Date('2024-01-01'),
          toDate: new Date('2024-01-02')
        }
      });

      expect(searchIndex.search).toHaveBeenCalledWith(
        'TypeScript',
        expect.objectContaining({
          filters: expect.objectContaining({
            type: 'message',
            metadata: expect.objectContaining({
              role: 'assistant'
            })
          })
        })
      );
    });

    it('handles search errors', async () => {
      vi.mocked(syncManager.sync).mockResolvedValueOnce({
        success: true,
        timestamp: Date.now()
      });
      vi.mocked(searchIndex.search).mockRejectedValueOnce(new Error('Search failed'));

      await expect(searchService.search({ query: 'TypeScript' }))
        .rejects.toThrow('Search failed');

      expect(vi.mocked(metricsCollector).record).toHaveBeenCalledWith(
        'search_service_failed',
        1,
        expect.any(Object)
      );
    });
  });

  describe('Indexing', () => {
    it('reindexes all data', async () => {
      vi.mocked(syncManager.sync).mockResolvedValueOnce({
        success: true,
        timestamp: Date.now()
      });
      vi.mocked(syncManager.getData).mockResolvedValueOnce(mockChatData);

      await searchService.reindexAll();

      expect(searchIndex.clear).toHaveBeenCalled();
      expect(searchIndex.addDocument).toHaveBeenCalledTimes(3); // Chat + 2 messages
      expect(vi.mocked(metricsCollector).record).toHaveBeenCalledWith(
        'search_service_reindex_success',
        1,
        expect.any(Object)
      );
    });

    it('prevents concurrent reindexing', async () => {
      vi.mocked(syncManager.sync).mockResolvedValueOnce({
        success: true,
        timestamp: Date.now()
      });

      const reindexPromise1 = searchService.reindexAll();
      const reindexPromise2 = searchService.reindexAll();

      await expect(reindexPromise2).rejects.toThrow('Indexing already in progress');
    });

    it('handles reindexing errors', async () => {
      vi.mocked(syncManager.sync).mockResolvedValueOnce({
        success: false,
        error: 'Sync failed'
      });

      await expect(searchService.reindexAll()).rejects.toThrow('Failed to sync data');
      expect(vi.mocked(metricsCollector).record).toHaveBeenCalledWith(
        'search_service_reindex_failed',
        1,
        expect.any(Object)
      );
    });
  });

  describe('Sync Integration', () => {
    it('ensures index is up to date before search', async () => {
      vi.mocked(syncManager.sync).mockResolvedValueOnce({
        success: true,
        timestamp: Date.now()
      });
      vi.mocked(syncManager.getData).mockResolvedValueOnce(mockChatData);
      vi.mocked(searchIndex.search).mockResolvedValueOnce([]);

      await searchService.search({ query: 'TypeScript' });

      expect(syncManager.sync).toHaveBeenCalled();
      expect(searchIndex.addDocument).toHaveBeenCalled();
    });

    it('skips reindexing if data is up to date', async () => {
      const timestamp = Date.now();
      vi.mocked(syncManager.sync).mockResolvedValueOnce({
        success: true,
        timestamp
      });

      // First search to set lastIndexedTimestamp
      await searchService.search({ query: 'TypeScript' });

      // Second search with same timestamp
      vi.mocked(syncManager.sync).mockResolvedValueOnce({
        success: true,
        timestamp
      });
      await searchService.search({ query: 'TypeScript' });

      // addDocument should only be called once for the first search
      expect(searchIndex.addDocument).toHaveBeenCalledTimes(
        mockChatData.chatHistory[0].messages.length + 1
      );
    });

    it('handles sync errors during search', async () => {
      vi.mocked(syncManager.sync).mockResolvedValueOnce({
        success: false,
        error: 'Sync failed'
      });

      await expect(searchService.search({ query: 'TypeScript' }))
        .rejects.toThrow('Failed to sync data');
    });
  });

  describe('Performance Tracking', () => {
    it('tracks search operations', async () => {
      vi.mocked(syncManager.sync).mockResolvedValueOnce({
        success: true,
        timestamp: Date.now()
      });
      vi.mocked(searchIndex.search).mockResolvedValueOnce([]);

      await searchService.search({ query: 'TypeScript' });

      expect(vi.mocked(performanceTracker).startOperation).toHaveBeenCalledWith({
        component: 'SearchService',
        operation: 'data_processing'
      });
      expect(vi.mocked(performanceTracker).endOperation).toHaveBeenCalled();
    });
  });

  describe('Metrics Collection', () => {
    it('records successful operations', async () => {
      vi.mocked(syncManager.sync).mockResolvedValueOnce({
        success: true,
        timestamp: Date.now()
      });
      vi.mocked(searchIndex.search).mockResolvedValueOnce([]);

      await searchService.search({ query: 'TypeScript' });

      expect(vi.mocked(metricsCollector).record).toHaveBeenCalledWith(
        'search_service_success',
        1,
        expect.any(Object)
      );
    });

    it('records failed operations', async () => {
      vi.mocked(syncManager.sync).mockResolvedValueOnce({
        success: false,
        error: 'Sync failed'
      });

      try {
        await searchService.search({ query: 'TypeScript' });
      } catch {
        expect(vi.mocked(metricsCollector).record).toHaveBeenCalledWith(
          'search_service_failed',
          1,
          expect.any(Object)
        );
      }
    });
  });
});

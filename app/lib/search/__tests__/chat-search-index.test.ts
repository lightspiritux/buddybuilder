import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatSearchIndex } from '../chat-search-index';
import { metricsCollector } from '../../ml/code-understanding/telemetry/metrics-collector';
import { performanceTracker } from '../../ml/code-understanding/telemetry/performance-tracker';

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

describe('ChatSearchIndex', () => {
  let searchIndex: ChatSearchIndex;

  const mockDocuments = [
    {
      id: 'msg1',
      content: 'Hello, how can I help you with TypeScript today?',
      type: 'message' as const,
      timestamp: new Date('2024-01-01T10:00:00Z'),
      metadata: { role: 'assistant' }
    },
    {
      id: 'msg2',
      content: 'I need help with React components and state management',
      type: 'message' as const,
      timestamp: new Date('2024-01-01T10:01:00Z'),
      metadata: { role: 'user' }
    },
    {
      id: 'chat1',
      content: 'TypeScript and React Development Discussion',
      type: 'chat' as const,
      timestamp: new Date('2024-01-01T10:00:00Z'),
      metadata: { topic: 'development' }
    }
  ];

  beforeEach(async () => {
    vi.clearAllMocks();
    searchIndex = ChatSearchIndex.getInstance();
    await searchIndex.clear();
    for (const doc of mockDocuments) {
      await searchIndex.addDocument(doc);
    }
  });

  describe('Initialization', () => {
    it('creates a singleton instance', () => {
      const instance1 = ChatSearchIndex.getInstance();
      const instance2 = ChatSearchIndex.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('Document Management', () => {
    it('adds documents successfully', async () => {
      const newDoc = {
        id: 'msg4',
        content: 'New message about JavaScript',
        type: 'message' as const,
        timestamp: new Date(),
        metadata: { role: 'user' }
      };

      await searchIndex.addDocument(newDoc);

      const results = await searchIndex.search('JavaScript');
      expect(results).toHaveLength(1);
      expect(results[0].document.id).toBe('msg4');
    });

    it('clears index successfully', async () => {
      await searchIndex.clear();
      const results = await searchIndex.search('TypeScript');
      expect(results).toHaveLength(0);
    });

    it('handles duplicate document IDs', async () => {
      const duplicateDoc = {
        id: 'msg1',
        content: 'Different content',
        type: 'message' as const,
        timestamp: new Date(),
        metadata: { role: 'user' }
      };

      await searchIndex.addDocument(duplicateDoc);
      const results = await searchIndex.search('Different');
      expect(results).toHaveLength(1);
      expect(results[0].document.content).toBe('Different content');
    });
  });

  describe('Search Functionality', () => {
    it('performs basic text search', async () => {
      const results = await searchIndex.search('TypeScript');
      expect(results).toHaveLength(2);
      expect(results.map(r => r.document.id)).toContain('msg1');
      expect(results.map(r => r.document.id)).toContain('chat1');
    });

    it('handles case-insensitive search', async () => {
      const results = await searchIndex.search('typescript');
      expect(results).toHaveLength(2);
    });

    it('returns empty array for no matches', async () => {
      const results = await searchIndex.search('nonexistent');
      expect(results).toHaveLength(0);
    });

    it('generates search highlights', async () => {
      const results = await searchIndex.search('TypeScript');
      expect(results[0].highlights).toBeDefined();
      expect(results[0].highlights[0].snippet).toContain('TypeScript');
      expect(results[0].highlights[0].positions).toBeDefined();
    });
  });

  describe('Search Filters', () => {
    it('filters by document type', async () => {
      const results = await searchIndex.search('TypeScript', {
        filters: { type: 'message' }
      });
      expect(results).toHaveLength(1);
      expect(results[0].document.type).toBe('message');
    });

    it('filters by date range', async () => {
      const results = await searchIndex.search('TypeScript', {
        filters: {
          fromDate: new Date('2024-01-01T09:00:00Z'),
          toDate: new Date('2024-01-01T11:00:00Z')
        }
      });
      expect(results).toHaveLength(2);
    });

    it('filters by metadata', async () => {
      const results = await searchIndex.search('TypeScript', {
        filters: {
          metadata: { role: 'assistant' }
        }
      });
      expect(results).toHaveLength(1);
      expect(results[0].document.metadata.role).toBe('assistant');
    });

    it('combines multiple filters', async () => {
      const results = await searchIndex.search('TypeScript', {
        filters: {
          type: 'message',
          metadata: { role: 'assistant' }
        }
      });
      expect(results).toHaveLength(1);
      expect(results[0].document.type).toBe('message');
      expect(results[0].document.metadata.role).toBe('assistant');
    });
  });

  describe('Search Options', () => {
    it('sorts by relevance by default', async () => {
      const results = await searchIndex.search('TypeScript React');
      expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
    });

    it('sorts by date', async () => {
      const results = await searchIndex.search('TypeScript React', {
        sortBy: 'date',
        sortOrder: 'desc'
      });
      expect(new Date(results[0].document.timestamp).getTime())
        .toBeGreaterThanOrEqual(new Date(results[1].document.timestamp).getTime());
    });

    it('applies pagination', async () => {
      const results = await searchIndex.search('TypeScript React', {
        limit: 1,
        offset: 1
      });
      expect(results).toHaveLength(1);
    });
  });

  describe('Performance Tracking', () => {
    it('tracks search operations', async () => {
      await searchIndex.search('TypeScript');
      expect(vi.mocked(performanceTracker).startOperation).toHaveBeenCalledWith({
        component: 'ChatSearchIndex',
        operation: 'data_processing'
      });
      expect(vi.mocked(performanceTracker).endOperation).toHaveBeenCalled();
    });
  });

  describe('Metrics Collection', () => {
    it('records successful operations', async () => {
      await searchIndex.search('TypeScript');
      expect(vi.mocked(metricsCollector).record).toHaveBeenCalledWith(
        'search_success',
        1,
        expect.any(Object)
      );
    });

    it('records failed operations', async () => {
      vi.spyOn(searchIndex as any, 'tokenize').mockImplementationOnce(() => {
        throw new Error('Tokenization failed');
      });

      try {
        await searchIndex.search('TypeScript');
      } catch {
        expect(vi.mocked(metricsCollector).record).toHaveBeenCalledWith(
          'search_failed',
          1,
          expect.any(Object)
        );
      }
    });
  });

  describe('Error Handling', () => {
    it('handles invalid search queries', async () => {
      const results = await searchIndex.search('');
      expect(results).toHaveLength(0);
    });

    it('handles invalid filter values', async () => {
      const results = await searchIndex.search('TypeScript', {
        filters: {
          type: 'invalid' as any
        }
      });
      expect(results).toHaveLength(0);
    });

    it('handles invalid date filters', async () => {
      const results = await searchIndex.search('TypeScript', {
        filters: {
          fromDate: new Date('invalid')
        }
      });
      expect(results).toHaveLength(0);
    });
  });
});

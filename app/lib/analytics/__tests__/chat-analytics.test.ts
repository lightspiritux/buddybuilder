import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatAnalytics, UsagePattern } from '../chat-analytics';
import { SyncManager, SyncData } from '../../cloud/sync-manager';
import { metricsCollector } from '../../ml/code-understanding/telemetry/metrics-collector';
import { performanceTracker } from '../../ml/code-understanding/telemetry/performance-tracker';

// Mock sync manager
vi.mock('../../cloud/sync-manager', () => ({
  SyncManager: {
    getInstance: vi.fn(() => ({
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

describe('ChatAnalytics', () => {
  let chatAnalytics: ChatAnalytics;
  let syncManager: ReturnType<typeof SyncManager.getInstance>;

  const mockChatData: SyncData = {
    chatHistory: [
      {
        id: 'chat1',
        messages: [
          {
            id: 'msg1',
            content: 'Hello, how can I help you with TypeScript?',
            role: 'assistant',
            timestamp: new Date('2024-01-01T10:00:00Z'),
            metadata: {}
          },
          {
            id: 'msg2',
            content: 'I need help with React components',
            role: 'user',
            timestamp: new Date('2024-01-01T10:01:00Z'),
            metadata: {}
          },
          {
            id: 'msg3',
            content: 'Here\'s how you can create a React component...',
            role: 'assistant',
            timestamp: new Date('2024-01-01T10:02:00Z'),
            metadata: {}
          }
        ],
        createdAt: new Date('2024-01-01T10:00:00Z'),
        updatedAt: new Date('2024-01-01T10:02:00Z'),
        metadata: { topic: 'development' }
      },
      {
        id: 'chat2',
        messages: [
          {
            id: 'msg4',
            content: 'How do I deploy my app?',
            role: 'user',
            timestamp: new Date('2024-01-01T15:00:00Z'),
            metadata: {}
          },
          {
            id: 'msg5',
            content: 'Let me explain the deployment process...',
            role: 'assistant',
            timestamp: new Date('2024-01-01T15:01:00Z'),
            metadata: {}
          }
        ],
        createdAt: new Date('2024-01-01T15:00:00Z'),
        updatedAt: new Date('2024-01-01T15:01:00Z'),
        metadata: { topic: 'deployment' }
      }
    ],
    settings: {
      theme: 'light',
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
    syncManager = SyncManager.getInstance();
    chatAnalytics = ChatAnalytics.getInstance();
  });

  describe('Initialization', () => {
    it('creates a singleton instance', () => {
      const instance1 = ChatAnalytics.getInstance();
      const instance2 = ChatAnalytics.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('Usage Pattern Analysis', () => {
    it('analyzes time of day distribution', async () => {
      vi.mocked(syncManager.getData).mockResolvedValueOnce(mockChatData);

      const patterns = await chatAnalytics.analyzeUsagePatterns();

      expect(patterns.timeOfDay).toEqual({
        morning: 3, // 10:00-10:02 messages
        afternoon: 2, // 15:00-15:01 messages
        evening: 0,
        night: 0
      });
    });

    it('analyzes message length statistics', async () => {
      vi.mocked(syncManager.getData).mockResolvedValueOnce(mockChatData);

      const patterns = await chatAnalytics.analyzeUsagePatterns();

      expect(patterns.messageLength.user.min).toBeLessThan(patterns.messageLength.user.max);
      expect(patterns.messageLength.assistant.min).toBeLessThan(patterns.messageLength.assistant.max);
      expect(patterns.messageLength.user.average).toBeGreaterThan(0);
      expect(patterns.messageLength.assistant.average).toBeGreaterThan(0);
    });

    it('calculates average response time', async () => {
      vi.mocked(syncManager.getData).mockResolvedValueOnce(mockChatData);

      const patterns = await chatAnalytics.analyzeUsagePatterns();

      expect(patterns.averageResponseTime).toBe(60000); // 1 minute in milliseconds
    });

    it('analyzes topic distribution', async () => {
      vi.mocked(syncManager.getData).mockResolvedValueOnce(mockChatData);

      const patterns = await chatAnalytics.analyzeUsagePatterns();

      expect(patterns.topicDistribution).toEqual({
        development: 1,
        deployment: 1
      });
    });

    it('calculates interaction frequency', async () => {
      const now = Date.now();
      vi.useFakeTimers();
      vi.setSystemTime(now);

      vi.mocked(syncManager.getData).mockResolvedValueOnce(mockChatData);

      const patterns = await chatAnalytics.analyzeUsagePatterns();

      expect(patterns.interactionFrequency).toEqual({
        daily: expect.any(Number),
        weekly: expect.any(Number),
        monthly: expect.any(Number)
      });

      vi.useRealTimers();
    });

    it('handles empty chat history', async () => {
      const emptyData: SyncData = {
        ...mockChatData,
        chatHistory: []
      };

      vi.mocked(syncManager.getData).mockResolvedValueOnce(emptyData);

      const patterns = await chatAnalytics.analyzeUsagePatterns();

      expect(patterns).toEqual({
        timeOfDay: { morning: 0, afternoon: 0, evening: 0, night: 0 },
        dayOfWeek: {
          Sunday: 0, Monday: 0, Tuesday: 0, Wednesday: 0,
          Thursday: 0, Friday: 0, Saturday: 0
        },
        topicDistribution: {},
        averageResponseTime: 0,
        messageLength: {
          user: { average: 0, min: 0, max: 0 },
          assistant: { average: 0, min: 0, max: 0 }
        },
        interactionFrequency: {
          daily: 0,
          weekly: 0,
          monthly: 0
        }
      });
    });

    it('uses cached results within time window', async () => {
      vi.mocked(syncManager.getData).mockResolvedValueOnce(mockChatData);

      // First call
      const patterns1 = await chatAnalytics.analyzeUsagePatterns();

      // Second call within cache window
      const patterns2 = await chatAnalytics.analyzeUsagePatterns();

      expect(syncManager.getData).toHaveBeenCalledTimes(1);
      expect(patterns1).toEqual(patterns2);
    });

    it('refreshes cache after time window', async () => {
      vi.mocked(syncManager.getData).mockResolvedValue(mockChatData);

      // First call
      await chatAnalytics.analyzeUsagePatterns();

      // Move time forward past cache window
      vi.useFakeTimers();
      vi.advanceTimersByTime(3600001); // 1 hour + 1ms

      // Second call after cache expired
      await chatAnalytics.analyzeUsagePatterns();

      expect(syncManager.getData).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });
  });

  describe('Error Handling', () => {
    it('handles missing chat data', async () => {
      vi.mocked(syncManager.getData).mockResolvedValueOnce(null);

      await expect(chatAnalytics.analyzeUsagePatterns())
        .rejects.toThrow('No chat data available for analysis');

      expect(vi.mocked(metricsCollector).record).toHaveBeenCalledWith(
        'chat_analytics_patterns_failed',
        1,
        expect.any(Object)
      );
    });

    it('handles sync manager errors', async () => {
      vi.mocked(syncManager.getData).mockRejectedValueOnce(new Error('Sync error'));

      await expect(chatAnalytics.analyzeUsagePatterns())
        .rejects.toThrow('Sync error');

      expect(vi.mocked(metricsCollector).record).toHaveBeenCalledWith(
        'chat_analytics_patterns_failed',
        1,
        expect.any(Object)
      );
    });
  });

  describe('Performance Tracking', () => {
    it('tracks analysis operations', async () => {
      vi.mocked(syncManager.getData).mockResolvedValueOnce(mockChatData);

      await chatAnalytics.analyzeUsagePatterns();

      expect(vi.mocked(performanceTracker).startOperation).toHaveBeenCalledWith({
        component: 'ChatAnalytics',
        operation: 'data_processing'
      });
      expect(vi.mocked(performanceTracker).endOperation).toHaveBeenCalled();
    });
  });

  describe('Metrics Collection', () => {
    it('records successful analysis', async () => {
      vi.mocked(syncManager.getData).mockResolvedValueOnce(mockChatData);

      await chatAnalytics.analyzeUsagePatterns();

      expect(vi.mocked(metricsCollector).record).toHaveBeenCalledWith(
        'chat_analytics_patterns_success',
        1,
        expect.any(Object)
      );
    });

    it('records failed analysis', async () => {
      vi.mocked(syncManager.getData).mockRejectedValueOnce(new Error('Analysis error'));

      try {
        await chatAnalytics.analyzeUsagePatterns();
      } catch {
        expect(vi.mocked(metricsCollector).record).toHaveBeenCalledWith(
          'chat_analytics_patterns_failed',
          1,
          expect.any(Object)
        );
      }
    });
  });
});

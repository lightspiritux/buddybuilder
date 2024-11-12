import { SyncManager, SyncData } from '../cloud/sync-manager';
import { metricsCollector, MetricType, MetricCategory } from '../ml/code-understanding/telemetry/metrics-collector';
import { performanceTracker, OperationType } from '../ml/code-understanding/telemetry/performance-tracker';

export interface UsagePattern {
  timeOfDay: {
    morning: number;   // 6-12
    afternoon: number; // 12-18
    evening: number;   // 18-24
    night: number;     // 0-6
  };
  dayOfWeek: {
    [key: string]: number; // Sunday-Saturday
  };
  topicDistribution: {
    [key: string]: number;
  };
  averageResponseTime: number;
  messageLength: {
    user: {
      average: number;
      min: number;
      max: number;
    };
    assistant: {
      average: number;
      min: number;
      max: number;
    };
  };
  interactionFrequency: {
    daily: number;
    weekly: number;
    monthly: number;
  };
}

export interface TopicCluster {
  name: string;
  keywords: string[];
  messageCount: number;
  relatedTopics: Array<{
    name: string;
    similarity: number;
  }>;
}

export class ChatAnalytics {
  private static instance: ChatAnalytics;
  private syncManager: SyncManager;
  private cachedAnalytics: {
    patterns?: UsagePattern;
    clusters?: TopicCluster[];
    lastUpdated: number;
  };

  private constructor() {
    this.syncManager = SyncManager.getInstance();
    this.cachedAnalytics = { lastUpdated: 0 };
    this.initializeMetrics();
  }

  static getInstance(): ChatAnalytics {
    if (!ChatAnalytics.instance) {
      ChatAnalytics.instance = new ChatAnalytics();
    }
    return ChatAnalytics.instance;
  }

  async analyzeUsagePatterns(): Promise<UsagePattern> {
    const operationId = performanceTracker.startOperation({
      component: 'ChatAnalytics',
      operation: OperationType.DATA_PROCESSING
    });

    try {
      // Check cache first
      if (this.cachedAnalytics.patterns && 
          Date.now() - this.cachedAnalytics.lastUpdated < 3600000) { // 1 hour cache
        return this.cachedAnalytics.patterns;
      }

      const data = await this.syncManager.getData();
      if (!data) {
        throw new Error('No chat data available for analysis');
      }

      const patterns = this.calculatePatterns(data);
      this.cachedAnalytics.patterns = patterns;
      this.cachedAnalytics.lastUpdated = Date.now();

      metricsCollector.record('chat_analytics_patterns_success', 1, {
        category: MetricCategory.SYSTEM
      });

      return patterns;
    } catch (error) {
      metricsCollector.record('chat_analytics_patterns_failed', 1, {
        category: MetricCategory.SYSTEM
      });
      throw error;
    } finally {
      performanceTracker.endOperation(operationId, {
        component: 'ChatAnalytics',
        operation: OperationType.DATA_PROCESSING
      });
    }
  }

  private calculatePatterns(data: SyncData): UsagePattern {
    const timeOfDay = { morning: 0, afternoon: 0, evening: 0, night: 0 };
    const dayOfWeek: { [key: string]: number } = {
      Sunday: 0, Monday: 0, Tuesday: 0, Wednesday: 0,
      Thursday: 0, Friday: 0, Saturday: 0
    };
    const topicDistribution: { [key: string]: number } = {};
    let totalResponseTime = 0;
    let responseCount = 0;
    const messageLengths = {
      user: { lengths: [] as number[], min: Infinity, max: 0 },
      assistant: { lengths: [] as number[], min: Infinity, max: 0 }
    };

    // Process each chat
    for (const chat of data.chatHistory) {
      // Track topics
      const topic = chat.metadata.topic as string || 'Uncategorized';
      topicDistribution[topic] = (topicDistribution[topic] || 0) + 1;

      let lastUserMessageTime: Date | null = null;

      // Process each message
      for (const message of chat.messages) {
        const timestamp = new Date(message.timestamp);
        const hour = timestamp.getHours();
        const day = timestamp.toLocaleDateString('en-US', { weekday: 'long' });

        // Time of day
        if (hour >= 6 && hour < 12) timeOfDay.morning++;
        else if (hour >= 12 && hour < 18) timeOfDay.afternoon++;
        else if (hour >= 18) timeOfDay.evening++;
        else timeOfDay.night++;

        // Day of week
        dayOfWeek[day]++;

        // Message lengths
        const length = message.content.length;
        const role = message.role;
        const stats = messageLengths[role];
        stats.lengths.push(length);
        stats.min = Math.min(stats.min, length);
        stats.max = Math.max(stats.max, length);

        // Response time calculation
        if (role === 'user') {
          lastUserMessageTime = timestamp;
        } else if (role === 'assistant' && lastUserMessageTime) {
          totalResponseTime += timestamp.getTime() - lastUserMessageTime.getTime();
          responseCount++;
          lastUserMessageTime = null;
        }
      }
    }

    // Calculate averages
    const calculateAverage = (lengths: number[]) =>
      lengths.length > 0 ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0;

    // Calculate interaction frequency
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const oneWeek = 7 * oneDay;
    const oneMonth = 30 * oneDay;

    const dailyMessages = data.chatHistory.filter(chat =>
      new Date(chat.updatedAt).getTime() > now - oneDay
    ).length;

    const weeklyMessages = data.chatHistory.filter(chat =>
      new Date(chat.updatedAt).getTime() > now - oneWeek
    ).length;

    const monthlyMessages = data.chatHistory.filter(chat =>
      new Date(chat.updatedAt).getTime() > now - oneMonth
    ).length;

    return {
      timeOfDay,
      dayOfWeek,
      topicDistribution,
      averageResponseTime: responseCount > 0 ? totalResponseTime / responseCount : 0,
      messageLength: {
        user: {
          average: calculateAverage(messageLengths.user.lengths),
          min: messageLengths.user.min === Infinity ? 0 : messageLengths.user.min,
          max: messageLengths.user.max
        },
        assistant: {
          average: calculateAverage(messageLengths.assistant.lengths),
          min: messageLengths.assistant.min === Infinity ? 0 : messageLengths.assistant.min,
          max: messageLengths.assistant.max
        }
      },
      interactionFrequency: {
        daily: dailyMessages,
        weekly: weeklyMessages,
        monthly: monthlyMessages
      }
    };
  }

  private initializeMetrics(): void {
    metricsCollector.registerMetric({
      name: 'chat_analytics_patterns_success',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of successful usage pattern analyses'
    });

    metricsCollector.registerMetric({
      name: 'chat_analytics_patterns_failed',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of failed usage pattern analyses'
    });
  }
}

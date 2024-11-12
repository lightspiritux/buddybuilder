import { ChatSearchIndex } from './chat-search-index';
import { SyncManager, SyncData, SyncResult } from '../cloud/sync-manager';
import { metricsCollector, MetricType, MetricCategory } from '../ml/code-understanding/telemetry/metrics-collector';
import { performanceTracker, OperationType } from '../ml/code-understanding/telemetry/performance-tracker';

export interface SearchOptions {
  query: string;
  filters?: {
    type?: 'message' | 'chat';
    fromDate?: Date;
    toDate?: Date;
    role?: 'user' | 'assistant';
    topic?: string;
  };
  pagination?: {
    limit?: number;
    offset?: number;
  };
  sort?: {
    by: 'relevance' | 'date';
    order: 'asc' | 'desc';
  };
}

interface SearchDocument {
  id: string;
  content: string;
  type: 'message' | 'chat';
  timestamp: Date;
  metadata: Record<string, unknown>;
}

export interface SearchResult {
  document: SearchDocument;
  score: number;
  highlights: Array<{
    field: string;
    snippet: string;
    positions: Array<[number, number]>;
  }>;
}

export class SearchService {
  private static instance: SearchService;
  private searchIndex: ChatSearchIndex;
  private syncManager: SyncManager;
  private indexingInProgress: boolean;
  private lastIndexedTimestamp: number;

  private constructor() {
    this.searchIndex = ChatSearchIndex.getInstance();
    this.syncManager = SyncManager.getInstance();
    this.indexingInProgress = false;
    this.lastIndexedTimestamp = 0;
    this.initializeMetrics();
  }

  static getInstance(): SearchService {
    if (!SearchService.instance) {
      SearchService.instance = new SearchService();
    }
    return SearchService.instance;
  }

  async search(options: SearchOptions): Promise<SearchResult[]> {
    const operationId = performanceTracker.startOperation({
      component: 'SearchService',
      operation: OperationType.DATA_PROCESSING
    });

    try {
      // Ensure index is up to date
      await this.ensureIndexSync();

      const searchResults = await this.searchIndex.search(options.query, {
        filters: {
          type: options.filters?.type,
          fromDate: options.filters?.fromDate,
          toDate: options.filters?.toDate,
          metadata: {
            ...(options.filters?.role && { role: options.filters.role }),
            ...(options.filters?.topic && { topic: options.filters.topic })
          }
        },
        limit: options.pagination?.limit,
        offset: options.pagination?.offset,
        sortBy: options.sort?.by,
        sortOrder: options.sort?.order
      });

      metricsCollector.record('search_service_success', 1, {
        category: MetricCategory.SYSTEM,
        labels: {
          resultCount: searchResults.length.toString()
        }
      });

      return searchResults;
    } catch (error) {
      metricsCollector.record('search_service_failed', 1, {
        category: MetricCategory.SYSTEM
      });
      throw error;
    } finally {
      performanceTracker.endOperation(operationId, {
        component: 'SearchService',
        operation: OperationType.DATA_PROCESSING
      });
    }
  }

  async reindexAll(): Promise<void> {
    if (this.indexingInProgress) {
      throw new Error('Indexing already in progress');
    }

    const operationId = performanceTracker.startOperation({
      component: 'SearchService',
      operation: OperationType.DATA_PROCESSING
    });

    this.indexingInProgress = true;

    try {
      // Clear existing index
      await this.searchIndex.clear();

      // Get all chat data
      const syncResult = await this.syncManager.sync();
      if (!syncResult.success) {
        throw new Error('Failed to sync data for reindexing');
      }

      // Index all chats and messages
      await this.indexChatData(syncResult);

      metricsCollector.record('search_service_reindex_success', 1, {
        category: MetricCategory.SYSTEM
      });
    } catch (error) {
      metricsCollector.record('search_service_reindex_failed', 1, {
        category: MetricCategory.SYSTEM
      });
      throw error;
    } finally {
      this.indexingInProgress = false;
      performanceTracker.endOperation(operationId, {
        component: 'SearchService',
        operation: OperationType.DATA_PROCESSING
      });
    }
  }

  private async ensureIndexSync(): Promise<void> {
    const operationId = performanceTracker.startOperation({
      component: 'SearchService',
      operation: OperationType.DATA_PROCESSING
    });

    try {
      // Get latest sync data
      const syncResult = await this.syncManager.sync();
      if (!syncResult.success) {
        throw new Error('Failed to sync data');
      }

      // Only reindex if there's new data
      const currentTimestamp = syncResult.timestamp || Date.now();
      if (currentTimestamp > this.lastIndexedTimestamp) {
        await this.indexChatData(syncResult);
        this.lastIndexedTimestamp = currentTimestamp;
      }

      metricsCollector.record('search_service_sync_success', 1, {
        category: MetricCategory.SYSTEM
      });
    } catch (error) {
      metricsCollector.record('search_service_sync_failed', 1, {
        category: MetricCategory.SYSTEM
      });
      throw error;
    } finally {
      performanceTracker.endOperation(operationId, {
        component: 'SearchService',
        operation: OperationType.DATA_PROCESSING
      });
    }
  }

  private async indexChatData(syncResult: SyncResult): Promise<void> {
    if (!syncResult.success) return;

    const data = await this.syncManager.getData();
    if (!data) return;

    // Index chat histories
    for (const chat of data.chatHistory) {
      // Index chat metadata
      await this.searchIndex.addDocument({
        id: chat.id,
        content: `Chat: ${chat.metadata.topic || 'Untitled'}`,
        type: 'chat',
        timestamp: chat.createdAt,
        metadata: chat.metadata
      });

      // Index messages
      for (const message of chat.messages) {
        await this.searchIndex.addDocument({
          id: message.id,
          content: message.content,
          type: 'message',
          timestamp: message.timestamp,
          metadata: {
            ...message.metadata,
            chatId: chat.id,
            role: message.role
          }
        });
      }
    }
  }

  private initializeMetrics(): void {
    metricsCollector.registerMetric({
      name: 'search_service_success',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of successful search operations'
    });

    metricsCollector.registerMetric({
      name: 'search_service_failed',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of failed search operations'
    });

    metricsCollector.registerMetric({
      name: 'search_service_reindex_success',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of successful reindex operations'
    });

    metricsCollector.registerMetric({
      name: 'search_service_reindex_failed',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of failed reindex operations'
    });

    metricsCollector.registerMetric({
      name: 'search_service_sync_success',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of successful index sync operations'
    });

    metricsCollector.registerMetric({
      name: 'search_service_sync_failed',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of failed index sync operations'
    });
  }
}

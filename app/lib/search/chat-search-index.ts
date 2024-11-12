import { metricsCollector, MetricType, MetricCategory } from '../ml/code-understanding/telemetry/metrics-collector';
import { performanceTracker, OperationType } from '../ml/code-understanding/telemetry/performance-tracker';

interface SearchDocument {
  id: string;
  content: string;
  type: 'message' | 'chat';
  timestamp: Date;
  metadata: Record<string, unknown>;
}

interface SearchResult {
  document: SearchDocument;
  score: number;
  highlights: Array<{
    field: string;
    snippet: string;
    positions: Array<[number, number]>;
  }>;
}

interface SearchOptions {
  filters?: {
    type?: 'message' | 'chat';
    fromDate?: Date;
    toDate?: Date;
    metadata?: Record<string, unknown>;
  };
  limit?: number;
  offset?: number;
  sortBy?: 'relevance' | 'date';
  sortOrder?: 'asc' | 'desc';
}

export class ChatSearchIndex {
  private static instance: ChatSearchIndex;
  private documents: Map<string, SearchDocument>;
  private invertedIndex: Map<string, Set<string>>;
  private wordFrequencies: Map<string, number>;

  private constructor() {
    this.documents = new Map();
    this.invertedIndex = new Map();
    this.wordFrequencies = new Map();
    this.initializeMetrics();
  }

  static getInstance(): ChatSearchIndex {
    if (!ChatSearchIndex.instance) {
      ChatSearchIndex.instance = new ChatSearchIndex();
    }
    return ChatSearchIndex.instance;
  }

  async addDocument(document: SearchDocument): Promise<void> {
    const operationId = performanceTracker.startOperation({
      component: 'ChatSearchIndex',
      operation: OperationType.DATA_PROCESSING
    });

    try {
      // Add document to documents map
      this.documents.set(document.id, document);

      // Tokenize and index document content
      const tokens = this.tokenize(document.content);
      for (const token of tokens) {
        // Update inverted index
        if (!this.invertedIndex.has(token)) {
          this.invertedIndex.set(token, new Set());
        }
        this.invertedIndex.get(token)!.add(document.id);

        // Update word frequencies
        this.wordFrequencies.set(token, (this.wordFrequencies.get(token) || 0) + 1);
      }

      metricsCollector.record('search_index_add_success', 1, {
        category: MetricCategory.SYSTEM
      });
    } catch (error) {
      metricsCollector.record('search_index_add_failed', 1, {
        category: MetricCategory.SYSTEM
      });
      throw error;
    } finally {
      performanceTracker.endOperation(operationId, {
        component: 'ChatSearchIndex',
        operation: OperationType.DATA_PROCESSING
      });
    }
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const operationId = performanceTracker.startOperation({
      component: 'ChatSearchIndex',
      operation: OperationType.DATA_PROCESSING
    });

    try {
      const queryTokens = this.tokenize(query);
      const documentScores = new Map<string, number>();

      // Calculate TF-IDF scores for each document
      for (const token of queryTokens) {
        const matchingDocs = this.invertedIndex.get(token) || new Set();
        const idf = Math.log(this.documents.size / (matchingDocs.size || 1));

        for (const docId of matchingDocs) {
          const doc = this.documents.get(docId)!;
          if (!this.matchesFilters(doc, options.filters)) continue;

          const tf = this.calculateTermFrequency(token, doc.content);
          const score = tf * idf;
          documentScores.set(docId, (documentScores.get(docId) || 0) + score);
        }
      }

      // Sort and format results
      const results = Array.from(documentScores.entries())
        .map(([docId, score]) => ({
          document: this.documents.get(docId)!,
          score,
          highlights: this.generateHighlights(this.documents.get(docId)!, queryTokens)
        }))
        .sort((a, b) => {
          if (options.sortBy === 'date') {
            const order = options.sortOrder === 'desc' ? -1 : 1;
            return order * (a.document.timestamp.getTime() - b.document.timestamp.getTime());
          }
          return b.score - a.score;
        });

      // Apply pagination
      const start = options.offset || 0;
      const end = options.limit ? start + options.limit : undefined;
      const paginatedResults = results.slice(start, end);

      metricsCollector.record('search_success', 1, {
        category: MetricCategory.SYSTEM,
        labels: {
          resultCount: paginatedResults.length.toString()
        }
      });

      return paginatedResults;
    } catch (error) {
      metricsCollector.record('search_failed', 1, {
        category: MetricCategory.SYSTEM
      });
      throw error;
    } finally {
      performanceTracker.endOperation(operationId, {
        component: 'ChatSearchIndex',
        operation: OperationType.DATA_PROCESSING
      });
    }
  }

  async clear(): Promise<void> {
    const operationId = performanceTracker.startOperation({
      component: 'ChatSearchIndex',
      operation: OperationType.DATA_PROCESSING
    });

    try {
      this.documents.clear();
      this.invertedIndex.clear();
      this.wordFrequencies.clear();

      metricsCollector.record('search_index_clear_success', 1, {
        category: MetricCategory.SYSTEM
      });
    } catch (error) {
      metricsCollector.record('search_index_clear_failed', 1, {
        category: MetricCategory.SYSTEM
      });
      throw error;
    } finally {
      performanceTracker.endOperation(operationId, {
        component: 'ChatSearchIndex',
        operation: OperationType.DATA_PROCESSING
      });
    }
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 0);
  }

  private calculateTermFrequency(term: string, text: string): number {
    const tokens = this.tokenize(text);
    const termCount = tokens.filter(t => t === term).length;
    return termCount / tokens.length;
  }

  private matchesFilters(doc: SearchDocument, filters?: SearchOptions['filters']): boolean {
    if (!filters) return true;

    if (filters.type && doc.type !== filters.type) return false;

    if (filters.fromDate && doc.timestamp < filters.fromDate) return false;
    if (filters.toDate && doc.timestamp > filters.toDate) return false;

    if (filters.metadata) {
      for (const [key, value] of Object.entries(filters.metadata)) {
        if (doc.metadata[key] !== value) return false;
      }
    }

    return true;
  }

  private generateHighlights(doc: SearchDocument, queryTokens: string[]): Array<{
    field: string;
    snippet: string;
    positions: Array<[number, number]>;
  }> {
    const highlights: Array<{
      field: string;
      snippet: string;
      positions: Array<[number, number]>;
    }> = [];

    const content = doc.content.toLowerCase();
    const positions: Array<[number, number]> = [];

    for (const token of queryTokens) {
      let pos = content.indexOf(token);
      while (pos !== -1) {
        positions.push([pos, pos + token.length]);
        pos = content.indexOf(token, pos + 1);
      }
    }

    // Merge overlapping positions
    const mergedPositions = this.mergePositions(positions);

    // Generate snippets with context
    for (const [start, end] of mergedPositions) {
      const snippetStart = Math.max(0, start - 50);
      const snippetEnd = Math.min(content.length, end + 50);
      highlights.push({
        field: 'content',
        snippet: doc.content.slice(snippetStart, snippetEnd),
        positions: [[start - snippetStart, end - snippetStart]]
      });
    }

    return highlights;
  }

  private mergePositions(positions: Array<[number, number]>): Array<[number, number]> {
    if (positions.length === 0) return [];

    const sorted = positions.sort(([a], [b]) => a - b);
    const merged: Array<[number, number]> = [sorted[0]];

    for (const [start, end] of sorted.slice(1)) {
      const [prevStart, prevEnd] = merged[merged.length - 1];
      if (start <= prevEnd) {
        merged[merged.length - 1] = [prevStart, Math.max(prevEnd, end)];
      } else {
        merged.push([start, end]);
      }
    }

    return merged;
  }

  private initializeMetrics(): void {
    metricsCollector.registerMetric({
      name: 'search_index_add_success',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of successful document additions to search index'
    });

    metricsCollector.registerMetric({
      name: 'search_index_add_failed',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of failed document additions to search index'
    });

    metricsCollector.registerMetric({
      name: 'search_success',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of successful search operations'
    });

    metricsCollector.registerMetric({
      name: 'search_failed',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of failed search operations'
    });

    metricsCollector.registerMetric({
      name: 'search_index_clear_success',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of successful index clear operations'
    });

    metricsCollector.registerMetric({
      name: 'search_index_clear_failed',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of failed index clear operations'
    });
  }
}

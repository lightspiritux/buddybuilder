import { type CodePattern } from './project-indexer';
import { type PatternMatch } from './pattern-recognizer';

/**
 * Completion Logger
 * 
 * Tracks and analyzes completion usage:
 * 1. Records completion suggestions and user responses
 * 2. Tracks acceptance/rejection patterns
 * 3. Monitors usage patterns for learning
 */

interface CompletionEvent {
  id: string;
  timestamp: number;
  type: 'suggestion' | 'acceptance' | 'rejection' | 'modification';
  context: CompletionContext;
  suggestion: CompletionSuggestion;
  userAction?: UserAction;
  metadata?: Record<string, any>;
}

interface CompletionContext {
  filePath: string;
  position: {
    line: number;
    column: number;
  };
  scope: string;
  surroundingCode: {
    before: string;
    after: string;
  };
  language: string;
  patterns: PatternMatch[];
}

interface CompletionSuggestion {
  text: string;
  source: 'pattern' | 'rule' | 'model';
  pattern?: CodePattern;
  confidence: number;
  relevance: number;
}

interface UserAction {
  type: 'accept' | 'reject' | 'modify';
  timestamp: number;
  duration: number;
  modifications?: {
    original: string;
    modified: string;
    editDistance: number;
  };
}

export interface CompletionStats {
  totalSuggestions: number;
  acceptedSuggestions: number;
  rejectedSuggestions: number;
  modifiedSuggestions: number;
  averageAcceptanceTime: number;
  patternStats: Map<string, PatternStats>;
}

export interface PatternStats {
  uses: number;
  accepts: number;
  rejects: number;
  modifications: number;
  averageConfidence: number;
  averageRelevance: number;
}

export class CompletionLogger {
  private events: CompletionEvent[];
  private stats: CompletionStats;
  private readonly maxEvents: number;
  private currentSession: string;

  constructor(maxEvents: number = 1000) {
    this.events = [];
    this.maxEvents = maxEvents;
    this.currentSession = this.generateSessionId();
    this.stats = this.initializeStats();
  }

  /**
   * Log a completion suggestion
   */
  logSuggestion(
    context: CompletionContext,
    suggestion: CompletionSuggestion
  ): string {
    const eventId = this.generateEventId();
    const event: CompletionEvent = {
      id: eventId,
      timestamp: Date.now(),
      type: 'suggestion',
      context,
      suggestion
    };

    this.addEvent(event);
    this.updateStats(event);
    return eventId;
  }

  /**
   * Log user's response to a suggestion
   */
  logResponse(
    eventId: string,
    action: UserAction
  ): void {
    const event = this.findEvent(eventId);
    if (!event) {
      console.warn(`No matching suggestion found for event ID: ${eventId}`);
      return;
    }

    const responseEvent: CompletionEvent = {
      id: this.generateEventId(),
      timestamp: Date.now(),
      type: action.type === 'accept' ? 'acceptance' : 
            action.type === 'reject' ? 'rejection' : 'modification',
      context: event.context,
      suggestion: event.suggestion,
      userAction: action
    };

    this.addEvent(responseEvent);
    this.updateStats(responseEvent);
  }

  /**
   * Get completion statistics
   */
  getStats(): CompletionStats {
    return {
      ...this.stats,
      patternStats: new Map(this.stats.patternStats)
    };
  }

  /**
   * Get pattern-specific statistics
   */
  getPatternStats(patternId: string): PatternStats | undefined {
    return this.stats.patternStats.get(patternId);
  }

  /**
   * Get recent completion events
   */
  getRecentEvents(limit: number = 10): CompletionEvent[] {
    return this.events.slice(-limit);
  }

  /**
   * Get events for a specific file
   */
  getFileEvents(filePath: string): CompletionEvent[] {
    return this.events.filter(event => 
      event.context.filePath === filePath
    );
  }

  /**
   * Clear old events
   */
  clearOldEvents(maxAge: number = 7 * 24 * 60 * 60 * 1000): void {
    const cutoff = Date.now() - maxAge;
    this.events = this.events.filter(event => 
      event.timestamp > cutoff
    );
  }

  /**
   * Export events for analysis
   */
  exportEvents(): string {
    return JSON.stringify({
      session: this.currentSession,
      timestamp: Date.now(),
      events: this.events
    });
  }

  /**
   * Import events from previous session
   */
  importEvents(data: string): void {
    try {
      const { events } = JSON.parse(data);
      this.events.push(...events);
      this.trimEvents();
      this.recalculateStats();
    } catch (error) {
      console.error('Error importing events:', error);
    }
  }

  private addEvent(event: CompletionEvent): void {
    this.events.push(event);
    this.trimEvents();
  }

  private trimEvents(): void {
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }
  }

  private findEvent(eventId: string): CompletionEvent | undefined {
    return this.events.find(event => event.id === eventId);
  }

  private updateStats(event: CompletionEvent): void {
    this.stats.totalSuggestions++;

    switch (event.type) {
      case 'acceptance':
        this.stats.acceptedSuggestions++;
        this.updatePatternStats(event, 'accepts');
        break;
      case 'rejection':
        this.stats.rejectedSuggestions++;
        this.updatePatternStats(event, 'rejects');
        break;
      case 'modification':
        this.stats.modifiedSuggestions++;
        this.updatePatternStats(event, 'modifications');
        break;
    }

    if (event.userAction) {
      this.updateTimingStats(event.userAction);
    }
  }

  private updatePatternStats(
    event: CompletionEvent,
    actionType: 'accepts' | 'rejects' | 'modifications'
  ): void {
    if (!event.suggestion.pattern) return;

    const patternId = event.suggestion.pattern.pattern;
    let stats = this.stats.patternStats.get(patternId);

    if (!stats) {
      stats = {
        uses: 0,
        accepts: 0,
        rejects: 0,
        modifications: 0,
        averageConfidence: 0,
        averageRelevance: 0
      };
      this.stats.patternStats.set(patternId, stats);
    }

    stats.uses++;
    stats[actionType]++;
    stats.averageConfidence = (
      (stats.averageConfidence * (stats.uses - 1) + event.suggestion.confidence) / 
      stats.uses
    );
    stats.averageRelevance = (
      (stats.averageRelevance * (stats.uses - 1) + event.suggestion.relevance) / 
      stats.uses
    );
  }

  private updateTimingStats(action: UserAction): void {
    const { acceptedSuggestions } = this.stats;
    if (action.type === 'accept') {
      this.stats.averageAcceptanceTime = (
        (this.stats.averageAcceptanceTime * (acceptedSuggestions - 1) + action.duration) /
        acceptedSuggestions
      );
    }
  }

  private initializeStats(): CompletionStats {
    return {
      totalSuggestions: 0,
      acceptedSuggestions: 0,
      rejectedSuggestions: 0,
      modifiedSuggestions: 0,
      averageAcceptanceTime: 0,
      patternStats: new Map()
    };
  }

  private recalculateStats(): void {
    this.stats = this.initializeStats();
    this.events.forEach(event => this.updateStats(event));
  }

  private generateEventId(): string {
    return `${this.currentSession}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

// Export singleton instance
export const completionLogger = new CompletionLogger();

/**
 * Memory Tracker
 * 
 * Monitors and manages memory usage:
 * 1. Memory usage tracking
 * 2. Warning system
 * 3. Garbage collection triggers
 */

// Extend Performance interface to include memory
declare global {
  interface Performance {
    memory?: {
      usedJSHeapSize: number;
      totalJSHeapSize: number;
      jsHeapSizeLimit: number;
    };
  }
  var gc: (() => void) | undefined;
}

interface MemoryStats {
  totalJSHeapSize: number;
  usedJSHeapSize: number;
  jsHeapSizeLimit: number;
  usage: number;
  timestamp: number;
}

interface MemoryThresholds {
  warning: number;
  critical: number;
  limit: number;
}

interface MemorySnapshot {
  stats: MemoryStats;
  components: Map<string, number>;
  largeObjects: Array<{
    name: string;
    size: number;
    type: string;
  }>;
}

type MemoryWarningCallback = (stats: MemoryStats, level: 'warning' | 'critical') => void;
type GCTriggerCallback = () => void;

export class MemoryTracker {
  private thresholds: MemoryThresholds;
  private warningCallbacks: Set<MemoryWarningCallback>;
  private gcTriggerCallbacks: Set<GCTriggerCallback>;
  private stats: MemoryStats[];
  private maxStatsLength: number;
  private componentUsage: Map<string, number>;
  private isTracking: boolean;
  private trackingInterval: number;
  private intervalId: ReturnType<typeof setInterval> | null;

  constructor(thresholds?: Partial<MemoryThresholds>) {
    this.thresholds = {
      warning: 0.7, // 70% of heap limit
      critical: 0.85, // 85% of heap limit
      limit: 0.95, // 95% of heap limit
      ...thresholds
    };

    this.warningCallbacks = new Set();
    this.gcTriggerCallbacks = new Set();
    this.stats = [];
    this.maxStatsLength = 100; // Keep last 100 measurements
    this.componentUsage = new Map();
    this.isTracking = false;
    this.trackingInterval = 5000; // 5 seconds
    this.intervalId = null;
  }

  /**
   * Start memory tracking
   */
  startTracking(interval?: number): void {
    if (this.isTracking) return;

    this.trackingInterval = interval || this.trackingInterval;
    this.isTracking = true;

    this.intervalId = setInterval(() => {
      this.measureMemory();
    }, this.trackingInterval);

    // Initial measurement
    this.measureMemory();
  }

  /**
   * Stop memory tracking
   */
  stopTracking(): void {
    if (!this.isTracking) return;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isTracking = false;
  }

  /**
   * Register memory warning callback
   */
  onWarning(callback: MemoryWarningCallback): () => void {
    this.warningCallbacks.add(callback);
    return () => this.warningCallbacks.delete(callback);
  }

  /**
   * Register GC trigger callback
   */
  onGCTrigger(callback: GCTriggerCallback): () => void {
    this.gcTriggerCallbacks.add(callback);
    return () => this.gcTriggerCallbacks.delete(callback);
  }

  /**
   * Track component memory usage
   */
  trackComponent(name: string, size: number): void {
    this.componentUsage.set(name, (this.componentUsage.get(name) || 0) + size);
    this.checkMemoryPressure();
  }

  /**
   * Release component memory
   */
  releaseComponent(name: string): void {
    this.componentUsage.delete(name);
  }

  /**
   * Get current memory stats
   */
  getStats(): MemoryStats {
    return this.stats[this.stats.length - 1];
  }

  /**
   * Get memory usage history
   */
  getHistory(): MemoryStats[] {
    return [...this.stats];
  }

  /**
   * Take memory snapshot
   */
  takeSnapshot(): MemorySnapshot {
    const stats = this.getStats();
    const components = new Map(this.componentUsage);
    const largeObjects = Array.from(components.entries())
      .filter(([, size]) => size > 1024 * 1024) // Objects larger than 1MB
      .map(([name, size]) => ({
        name,
        size,
        type: this.inferObjectType(name)
      }))
      .sort((a, b) => b.size - a.size);

    return {
      stats,
      components,
      largeObjects
    };
  }

  /**
   * Suggest garbage collection
   */
  suggestGC(): void {
    if (globalThis.gc) {
      this.gcTriggerCallbacks.forEach(callback => callback());
      globalThis.gc();
    }
  }

  /**
   * Measure current memory usage
   */
  private measureMemory(): void {
    if (!performance || !performance.memory) {
      console.warn('Memory API not available');
      return;
    }

    const memory = performance.memory;
    const stats: MemoryStats = {
      totalJSHeapSize: memory.totalJSHeapSize,
      usedJSHeapSize: memory.usedJSHeapSize,
      jsHeapSizeLimit: memory.jsHeapSizeLimit,
      usage: memory.usedJSHeapSize / memory.jsHeapSizeLimit,
      timestamp: Date.now()
    };

    this.stats.push(stats);
    if (this.stats.length > this.maxStatsLength) {
      this.stats.shift();
    }

    this.checkMemoryPressure();
  }

  /**
   * Check memory pressure and trigger warnings
   */
  private checkMemoryPressure(): void {
    const stats = this.getStats();
    if (!stats) return;

    if (stats.usage >= this.thresholds.critical) {
      this.notifyWarning(stats, 'critical');
      this.suggestGC();
    } else if (stats.usage >= this.thresholds.warning) {
      this.notifyWarning(stats, 'warning');
    }

    if (stats.usage >= this.thresholds.limit) {
      this.handleMemoryLimit();
    }
  }

  /**
   * Handle memory limit reached
   */
  private handleMemoryLimit(): void {
    // Force cleanup of non-essential caches and buffers
    this.componentUsage.forEach((size, name) => {
      if (this.isNonEssentialComponent(name)) {
        this.releaseComponent(name);
      }
    });

    this.suggestGC();
  }

  /**
   * Notify warning callbacks
   */
  private notifyWarning(stats: MemoryStats, level: 'warning' | 'critical'): void {
    this.warningCallbacks.forEach(callback => callback(stats, level));
  }

  /**
   * Check if component is non-essential
   */
  private isNonEssentialComponent(name: string): boolean {
    // Components that can be safely cleared under memory pressure
    const nonEssentialPrefixes = [
      'cache',
      'buffer',
      'temp',
      'preview',
      'history'
    ];

    return nonEssentialPrefixes.some(prefix => 
      name.toLowerCase().includes(prefix)
    );
  }

  /**
   * Infer object type from name
   */
  private inferObjectType(name: string): string {
    if (name.includes('Cache')) return 'cache';
    if (name.includes('Buffer')) return 'buffer';
    if (name.includes('Model')) return 'model';
    if (name.includes('Worker')) return 'worker';
    if (name.includes('Data')) return 'data';
    return 'unknown';
  }
}

// Export singleton instance
export const memoryTracker = new MemoryTracker();

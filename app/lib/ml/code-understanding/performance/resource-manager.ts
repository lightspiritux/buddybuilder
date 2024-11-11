import { memoryTracker } from './memory-tracker';

/**
 * Resource Manager
 * 
 * Manages system resources and cleanup:
 * 1. Resource allocation and limits
 * 2. Cleanup strategies
 * 3. Resource pressure handling
 */

interface ResourceLimits {
  maxMemory: number;
  maxCacheSize: number;
  maxWorkers: number;
  maxConcurrentTasks: number;
}

interface ResourceUsage {
  memory: number;
  cacheSize: number;
  activeWorkers: number;
  runningTasks: number;
}

interface CleanupStrategy {
  name: string;
  priority: number;
  condition: (usage: ResourceUsage) => boolean;
  cleanup: () => Promise<void>;
}

interface ResourceStats {
  usage: ResourceUsage;
  limits: ResourceLimits;
  availableMemory: number;
  pressure: 'low' | 'medium' | 'high';
  lastCleanup: number;
}

export class ResourceManager {
  private limits: ResourceLimits;
  private cleanupStrategies: CleanupStrategy[];
  private resources: Map<string, any>;
  private lastCleanupTime: number;
  private isCleaningUp: boolean;

  constructor(limits?: Partial<ResourceLimits>) {
    this.limits = {
      maxMemory: 500 * 1024 * 1024, // 500MB
      maxCacheSize: 100 * 1024 * 1024, // 100MB
      maxWorkers: navigator.hardwareConcurrency || 4,
      maxConcurrentTasks: 10,
      ...limits
    };

    this.cleanupStrategies = [];
    this.resources = new Map();
    this.lastCleanupTime = 0;
    this.isCleaningUp = false;

    this.initializeCleanupStrategies();
    this.initializeMemoryTracking();
  }

  /**
   * Register a resource
   */
  registerResource(id: string, resource: any, size?: number): void {
    this.resources.set(id, {
      resource,
      size: size || this.estimateSize(resource),
      lastAccessed: Date.now()
    });

    if (size) {
      memoryTracker.trackComponent(id, size);
    }

    this.checkResourcePressure();
  }

  /**
   * Release a resource
   */
  releaseResource(id: string): void {
    const resourceInfo = this.resources.get(id);
    if (!resourceInfo) return;

    memoryTracker.releaseComponent(id);
    this.resources.delete(id);

    // Cleanup resource if needed
    if (typeof resourceInfo.resource.dispose === 'function') {
      resourceInfo.resource.dispose();
    } else if (typeof resourceInfo.resource.destroy === 'function') {
      resourceInfo.resource.destroy();
    } else if (resourceInfo.resource instanceof ArrayBuffer) {
      // Clear array buffer
      new Uint8Array(resourceInfo.resource).fill(0);
    }
  }

  /**
   * Get resource stats
   */
  getStats(): ResourceStats {
    const usage: ResourceUsage = {
      memory: memoryTracker.getStats()?.usedJSHeapSize || 0,
      cacheSize: this.calculateCacheSize(),
      activeWorkers: this.countActiveWorkers(),
      runningTasks: this.countRunningTasks()
    };

    return {
      usage,
      limits: this.limits,
      availableMemory: this.limits.maxMemory - usage.memory,
      pressure: this.calculateResourcePressure(usage),
      lastCleanup: this.lastCleanupTime
    };
  }

  /**
   * Add cleanup strategy
   */
  addCleanupStrategy(strategy: CleanupStrategy): void {
    this.cleanupStrategies.push(strategy);
    this.cleanupStrategies.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Force cleanup
   */
  async forceCleanup(): Promise<void> {
    if (this.isCleaningUp) return;

    this.isCleaningUp = true;
    try {
      const usage = this.getStats().usage;
      
      for (const strategy of this.cleanupStrategies) {
        if (strategy.condition(usage)) {
          await strategy.cleanup();
        }
      }

      this.lastCleanupTime = Date.now();
    } finally {
      this.isCleaningUp = false;
    }
  }

  /**
   * Initialize cleanup strategies
   */
  private initializeCleanupStrategies(): void {
    // Memory cleanup strategy
    this.addCleanupStrategy({
      name: 'memory',
      priority: 3,
      condition: (usage) => usage.memory > this.limits.maxMemory * 0.8,
      cleanup: async () => {
        // Clear old resources
        const now = Date.now();
        for (const [id, info] of this.resources.entries()) {
          if (now - info.lastAccessed > 5 * 60 * 1000) { // 5 minutes
            this.releaseResource(id);
          }
        }

        // Suggest garbage collection
        memoryTracker.suggestGC();
      }
    });

    // Cache cleanup strategy
    this.addCleanupStrategy({
      name: 'cache',
      priority: 2,
      condition: (usage) => usage.cacheSize > this.limits.maxCacheSize,
      cleanup: async () => {
        // Clear least recently used caches
        const caches = Array.from(this.resources.entries())
          .filter(([id]) => id.includes('cache'))
          .sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed);

        for (const [id] of caches.slice(0, Math.ceil(caches.length * 0.2))) {
          this.releaseResource(id);
        }
      }
    });

    // Worker cleanup strategy
    this.addCleanupStrategy({
      name: 'workers',
      priority: 1,
      condition: (usage) => usage.activeWorkers > this.limits.maxWorkers,
      cleanup: async () => {
        // Terminate idle workers
        const workers = Array.from(this.resources.entries())
          .filter(([id, info]) => id.includes('worker') && info.resource.status === 'idle')
          .sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed);

        for (const [id] of workers.slice(0, workers.length - this.limits.maxWorkers)) {
          this.releaseResource(id);
        }
      }
    });
  }

  /**
   * Initialize memory tracking
   */
  private initializeMemoryTracking(): void {
    memoryTracker.onWarning((stats, level) => {
      if (level === 'critical') {
        this.forceCleanup();
      }
    });

    memoryTracker.startTracking();
  }

  /**
   * Check resource pressure
   */
  private checkResourcePressure(): void {
    const stats = this.getStats();
    if (stats.pressure === 'high') {
      this.forceCleanup();
    }
  }

  /**
   * Calculate cache size
   */
  private calculateCacheSize(): number {
    return Array.from(this.resources.entries())
      .filter(([id]) => id.includes('cache'))
      .reduce((total, [, info]) => total + info.size, 0);
  }

  /**
   * Count active workers
   */
  private countActiveWorkers(): number {
    return Array.from(this.resources.entries())
      .filter(([id]) => id.includes('worker'))
      .length;
  }

  /**
   * Count running tasks
   */
  private countRunningTasks(): number {
    return Array.from(this.resources.entries())
      .filter(([id, info]) => id.includes('task') && info.resource.status === 'running')
      .length;
  }

  /**
   * Calculate resource pressure
   */
  private calculateResourcePressure(usage: ResourceUsage): 'low' | 'medium' | 'high' {
    const memoryPressure = usage.memory / this.limits.maxMemory;
    const cachePressure = usage.cacheSize / this.limits.maxCacheSize;
    const workerPressure = usage.activeWorkers / this.limits.maxWorkers;
    const taskPressure = usage.runningTasks / this.limits.maxConcurrentTasks;

    const avgPressure = (memoryPressure + cachePressure + workerPressure + taskPressure) / 4;

    if (avgPressure > 0.8) return 'high';
    if (avgPressure > 0.6) return 'medium';
    return 'low';
  }

  /**
   * Estimate size of a resource
   */
  private estimateSize(resource: any): number {
    if (resource instanceof ArrayBuffer) {
      return resource.byteLength;
    }

    if (resource instanceof Blob) {
      return resource.size;
    }

    if (typeof resource === 'string') {
      return resource.length * 2; // Approximate UTF-16 size
    }

    // Rough estimation for objects
    return JSON.stringify(resource).length * 2;
  }
}

// Export singleton instance
export const resourceManager = new ResourceManager();

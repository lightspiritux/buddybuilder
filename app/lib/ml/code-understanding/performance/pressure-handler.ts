import { memoryTracker } from './memory-tracker';
import { resourceManager } from './resource-manager';
import { taskQueue } from './task-queue';
import { workerPool } from './worker-pool';

/**
 * Pressure Handler
 * 
 * Manages system pressure and coordinates responses:
 * 1. Pressure detection and monitoring
 * 2. Mitigation strategies
 * 3. Recovery actions
 */

interface PressureThresholds {
  memory: {
    moderate: number;
    critical: number;
  };
  cpu: {
    moderate: number;
    critical: number;
  };
  tasks: {
    moderate: number;
    critical: number;
  };
}

interface PressureState {
  memory: 'normal' | 'moderate' | 'critical';
  cpu: 'normal' | 'moderate' | 'critical';
  tasks: 'normal' | 'moderate' | 'critical';
  overall: 'normal' | 'moderate' | 'critical';
  timestamp: number;
}

type PressureCallback = (state: PressureState) => void;
type MitigationStrategy = (state: PressureState) => Promise<void>;

export class PressureHandler {
  private thresholds: PressureThresholds;
  private pressureState: PressureState;
  private pressureCallbacks: Set<PressureCallback>;
  private mitigationStrategies: Map<string, MitigationStrategy>;
  private isHandlingPressure: boolean;
  private recoveryTimeout: number;
  private checkInterval: ReturnType<typeof setInterval> | null;

  constructor() {
    this.thresholds = {
      memory: {
        moderate: 0.7, // 70% usage
        critical: 0.85 // 85% usage
      },
      cpu: {
        moderate: 0.6, // 60% usage
        critical: 0.8 // 80% usage
      },
      tasks: {
        moderate: 0.7, // 70% capacity
        critical: 0.9 // 90% capacity
      }
    };

    this.pressureState = {
      memory: 'normal',
      cpu: 'normal',
      tasks: 'normal',
      overall: 'normal',
      timestamp: Date.now()
    };

    this.pressureCallbacks = new Set();
    this.mitigationStrategies = new Map();
    this.isHandlingPressure = false;
    this.recoveryTimeout = 30000; // 30 seconds
    this.checkInterval = null;

    this.initializeMitigationStrategies();
  }

  /**
   * Start pressure monitoring
   */
  startMonitoring(interval: number = 5000): void {
    if (this.checkInterval) return;

    this.checkInterval = setInterval(() => {
      this.checkPressure();
    }, interval);

    // Initial check
    this.checkPressure();
  }

  /**
   * Stop pressure monitoring
   */
  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Register pressure callback
   */
  onPressureChange(callback: PressureCallback): () => void {
    this.pressureCallbacks.add(callback);
    return () => this.pressureCallbacks.delete(callback);
  }

  /**
   * Add mitigation strategy
   */
  addMitigationStrategy(name: string, strategy: MitigationStrategy): void {
    this.mitigationStrategies.set(name, strategy);
  }

  /**
   * Get current pressure state
   */
  getPressureState(): PressureState {
    return { ...this.pressureState };
  }

  /**
   * Force pressure check
   */
  async forcePressureCheck(): Promise<void> {
    await this.checkPressure();
  }

  /**
   * Check system pressure
   */
  private async checkPressure(): Promise<void> {
    const memoryStats = memoryTracker.getStats();
    const resourceStats = resourceManager.getStats();

    // Update pressure state
    const newState: PressureState = {
      memory: this.getMemoryPressureLevel(memoryStats.usage),
      cpu: this.getCPUPressureLevel(),
      tasks: this.getTaskPressureLevel(resourceStats),
      overall: 'normal',
      timestamp: Date.now()
    };

    // Calculate overall pressure
    newState.overall = this.calculateOverallPressure(newState);

    // Check if state has changed
    if (this.hasPressureChanged(newState)) {
      this.pressureState = newState;
      this.notifyPressureChange();

      if (newState.overall !== 'normal') {
        await this.handlePressure(newState);
      }
    }
  }

  /**
   * Handle pressure situation
   */
  private async handlePressure(state: PressureState): Promise<void> {
    if (this.isHandlingPressure) return;

    this.isHandlingPressure = true;
    try {
      // Apply mitigation strategies in order
      for (const [name, strategy] of this.mitigationStrategies) {
        try {
          await strategy(state);
        } catch (error) {
          console.error(`Error in mitigation strategy ${name}:`, error);
        }
      }

      // Schedule recovery check
      setTimeout(() => this.checkRecovery(), this.recoveryTimeout);
    } finally {
      this.isHandlingPressure = false;
    }
  }

  /**
   * Check system recovery
   */
  private async checkRecovery(): Promise<void> {
    await this.checkPressure();

    if (this.pressureState.overall !== 'normal') {
      // If still under pressure, schedule another recovery check
      setTimeout(() => this.checkRecovery(), this.recoveryTimeout);
    }
  }

  /**
   * Initialize default mitigation strategies
   */
  private initializeMitigationStrategies(): void {
    // Memory pressure mitigation
    this.addMitigationStrategy('memory', async (state) => {
      if (state.memory === 'critical') {
        await resourceManager.forceCleanup();
        memoryTracker.suggestGC();
      } else if (state.memory === 'moderate') {
        // Clear non-essential caches
        const stats = resourceManager.getStats();
        if (stats.usage.cacheSize > stats.limits.maxCacheSize * 0.5) {
          await resourceManager.forceCleanup();
        }
      }
    });

    // Task pressure mitigation
    this.addMitigationStrategy('tasks', async (state) => {
      if (state.tasks === 'critical') {
        // Pause task queue and clear non-essential tasks
        const stats = resourceManager.getStats();
        if (stats.usage.runningTasks > stats.limits.maxConcurrentTasks * 0.8) {
          // TODO: Implement task queue pausing and cleanup
        }
      }
    });

    // Worker pressure mitigation
    this.addMitigationStrategy('workers', async (state) => {
      if (state.overall === 'critical') {
        // Terminate excess workers
        workerPool.terminate();
      }
    });
  }

  /**
   * Get memory pressure level
   */
  private getMemoryPressureLevel(usage: number): PressureState['memory'] {
    if (usage >= this.thresholds.memory.critical) return 'critical';
    if (usage >= this.thresholds.memory.moderate) return 'moderate';
    return 'normal';
  }

  /**
   * Get CPU pressure level
   */
  private getCPUPressureLevel(): PressureState['cpu'] {
    // TODO: Implement actual CPU usage monitoring
    return 'normal';
  }

  /**
   * Get task pressure level
   */
  private getTaskPressureLevel(stats: any): PressureState['tasks'] {
    const taskUsage = stats.usage.runningTasks / stats.limits.maxConcurrentTasks;
    if (taskUsage >= this.thresholds.tasks.critical) return 'critical';
    if (taskUsage >= this.thresholds.tasks.moderate) return 'moderate';
    return 'normal';
  }

  /**
   * Calculate overall pressure level
   */
  private calculateOverallPressure(state: PressureState): PressureState['overall'] {
    const levels = [state.memory, state.cpu, state.tasks];
    
    if (levels.includes('critical')) return 'critical';
    if (levels.includes('moderate')) return 'moderate';
    return 'normal';
  }

  /**
   * Check if pressure state has changed
   */
  private hasPressureChanged(newState: PressureState): boolean {
    return (
      newState.memory !== this.pressureState.memory ||
      newState.cpu !== this.pressureState.cpu ||
      newState.tasks !== this.pressureState.tasks ||
      newState.overall !== this.pressureState.overall
    );
  }

  /**
   * Notify pressure change callbacks
   */
  private notifyPressureChange(): void {
    this.pressureCallbacks.forEach(callback => {
      try {
        callback(this.pressureState);
      } catch (error) {
        console.error('Error in pressure callback:', error);
      }
    });
  }
}

// Export singleton instance
export const pressureHandler = new PressureHandler();

/**
 * Task Queue System
 * 
 * Manages background processing of tasks:
 * 1. Priority-based task scheduling
 * 2. Progress tracking
 * 3. Resource management
 */

export interface Task<T> {
  id: string;
  type: string;
  priority: number;
  data: any;
  execute: () => Promise<T>;
  onProgress?: (progress: number) => void;
  maxRetries?: number;
  timeout?: number;
  dependencies?: string[];
}

interface TaskStatus {
  id: string;
  type: string;
  state: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  error?: Error;
  startTime?: number;
  endTime?: number;
  retries: number;
}

interface QueueStats {
  pending: number;
  running: number;
  completed: number;
  failed: number;
  averageWaitTime: number;
  averageProcessingTime: number;
}

type TaskProgressCallback = (status: TaskStatus) => void;

export class TaskQueue {
  private queue: Task<any>[];
  private running: Map<string, TaskStatus>;
  private completed: Map<string, TaskStatus>;
  private progressCallbacks: Set<TaskProgressCallback>;
  private maxConcurrent: number;
  private isProcessing: boolean;
  private resourceLimits: {
    maxMemory: number;
    maxCPU: number;
  };

  constructor(maxConcurrent = 3) {
    this.queue = [];
    this.running = new Map();
    this.completed = new Map();
    this.progressCallbacks = new Set();
    this.maxConcurrent = maxConcurrent;
    this.isProcessing = false;
    this.resourceLimits = {
      maxMemory: 500 * 1024 * 1024, // 500MB
      maxCPU: 0.8 // 80% CPU usage
    };
  }

  /**
   * Add a task to the queue
   */
  async enqueue<T>(task: Task<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const enhancedTask: Task<T> = {
        ...task,
        execute: async () => {
          try {
            const result = await this.executeTask(task);
            resolve(result);
            return result;
          } catch (error) {
            reject(error);
            throw error;
          }
        }
      };

      this.queue.push(enhancedTask);
      this.sortQueue();
      this.processQueue();
    });
  }

  /**
   * Register progress callback
   */
  onProgress(callback: TaskProgressCallback): () => void {
    this.progressCallbacks.add(callback);
    return () => this.progressCallbacks.delete(callback);
  }

  /**
   * Get task status
   */
  getTaskStatus(taskId: string): TaskStatus | undefined {
    return (
      this.running.get(taskId) ||
      this.completed.get(taskId)
    );
  }

  /**
   * Get queue statistics
   */
  getStats(): QueueStats {
    const completedTasks = Array.from(this.completed.values());
    const waitTimes = completedTasks.map(task => 
      (task.startTime || 0) - (task.endTime || 0)
    );
    const processingTimes = completedTasks.map(task => 
      (task.endTime || 0) - (task.startTime || 0)
    );

    return {
      pending: this.queue.length,
      running: this.running.size,
      completed: this.completed.size,
      failed: Array.from(this.completed.values()).filter(t => t.state === 'failed').length,
      averageWaitTime: waitTimes.length ? 
        waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length : 0,
      averageProcessingTime: processingTimes.length ?
        processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length : 0
    };
  }

  /**
   * Clear completed tasks
   */
  clearCompleted(): void {
    this.completed.clear();
  }

  /**
   * Process the queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) return;
    if (this.running.size >= this.maxConcurrent) return;
    if (!this.checkResources()) return;

    this.isProcessing = true;

    try {
      while (this.queue.length > 0 && this.running.size < this.maxConcurrent) {
        if (!this.checkResources()) break;

        const task = this.queue.shift();
        if (!task) break;

        const status: TaskStatus = {
          id: task.id,
          type: task.type,
          state: 'pending',
          progress: 0,
          retries: 0
        };

        this.running.set(task.id, status);
        this.notifyProgress(status);

        // Execute task
        this.executeTaskWithRetry(task, status);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Execute a task with retry logic
   */
  private async executeTaskWithRetry(task: Task<any>, status: TaskStatus): Promise<void> {
    const maxRetries = task.maxRetries || 3;
    let lastError: Error | undefined;

    while (status.retries < maxRetries) {
      try {
        status.state = 'running';
        status.startTime = Date.now();
        this.notifyProgress(status);

        const result = await Promise.race([
          task.execute(),
          this.createTimeout(task.timeout || 30000)
        ]);

        status.state = 'completed';
        status.progress = 100;
        status.endTime = Date.now();
        this.notifyProgress(status);

        this.running.delete(task.id);
        this.completed.set(task.id, status);

        return;
      } catch (error) {
        lastError = error as Error;
        status.retries++;
        status.error = lastError;
        this.notifyProgress(status);

        if (status.retries < maxRetries) {
          await this.delay(Math.pow(2, status.retries) * 1000); // Exponential backoff
        }
      }
    }

    status.state = 'failed';
    status.error = lastError;
    this.notifyProgress(status);

    this.running.delete(task.id);
    this.completed.set(task.id, status);
  }

  /**
   * Execute a single task
   */
  private async executeTask<T>(task: Task<T>): Promise<T> {
    // Load dependencies if any
    if (task.dependencies?.length) {
      await this.loadDependencies(task.dependencies);
    }

    return task.execute();
  }

  /**
   * Load task dependencies
   */
  private async loadDependencies(dependencies: string[]): Promise<void> {
    // Wait for dependent tasks to complete
    const dependentTasks = dependencies.map(depId => {
      const status = this.getTaskStatus(depId);
      if (!status || status.state === 'failed') {
        throw new Error(`Dependency ${depId} not found or failed`);
      }
      return status;
    });

    await Promise.all(
      dependentTasks.map(status => 
        new Promise<void>((resolve, reject) => {
          if (status.state === 'completed') {
            resolve();
          } else {
            const checkInterval = setInterval(() => {
              const currentStatus = this.getTaskStatus(status.id);
              if (currentStatus?.state === 'completed') {
                clearInterval(checkInterval);
                resolve();
              } else if (currentStatus?.state === 'failed') {
                clearInterval(checkInterval);
                reject(new Error(`Dependency ${status.id} failed`));
              }
            }, 100);
          }
        })
      )
    );
  }

  /**
   * Sort queue by priority
   */
  private sortQueue(): void {
    this.queue.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Check system resources
   */
  private checkResources(): boolean {
    // TODO: Implement actual resource checking
    return true;
  }

  /**
   * Create timeout promise
   */
  private createTimeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Task timeout')), ms);
    });
  }

  /**
   * Notify progress callbacks
   */
  private notifyProgress(status: TaskStatus): void {
    this.progressCallbacks.forEach(callback => callback(status));
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const taskQueue = new TaskQueue();

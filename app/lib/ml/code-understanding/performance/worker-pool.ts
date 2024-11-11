import { taskQueue, type Task } from './task-queue';

/**
 * Worker Pool
 * 
 * Manages a pool of web workers for background processing:
 * 1. Worker lifecycle management
 * 2. Task distribution
 * 3. Resource monitoring
 */

interface WorkerInfo {
  worker: Worker;
  status: 'idle' | 'busy';
  taskId?: string;
  startTime?: number;
  taskCount: number;
  errors: number;
}

interface WorkerMessage {
  type: 'result' | 'error' | 'progress';
  taskId: string;
  data?: any;
  error?: Error;
  progress?: number;
}

interface WorkerTask extends Task<any> {
  transferables?: ArrayBuffer[];
}

interface WorkerStats {
  totalWorkers: number;
  activeWorkers: number;
  completedTasks: number;
  failedTasks: number;
  averageProcessingTime: number;
}

export class WorkerPool {
  private workers: Map<number, WorkerInfo>;
  private maxWorkers: number;
  private taskResults: Map<string, any>;
  private taskCallbacks: Map<string, Set<(result: any) => void>>;
  private processingTimes: number[];
  private isInitialized: boolean;

  constructor(maxWorkers = navigator.hardwareConcurrency || 4) {
    this.workers = new Map();
    this.maxWorkers = maxWorkers;
    this.taskResults = new Map();
    this.taskCallbacks = new Map();
    this.processingTimes = [];
    this.isInitialized = false;
  }

  /**
   * Initialize worker pool
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      for (let i = 0; i < this.maxWorkers; i++) {
        await this.createWorker(i);
      }
      this.isInitialized = true;
    } catch (error) {
      console.error('Error initializing worker pool:', error);
      throw error;
    }
  }

  /**
   * Execute task in worker pool
   */
  async executeTask<T>(task: WorkerTask): Promise<T> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return new Promise<T>((resolve, reject) => {
      const callbacks = this.taskCallbacks.get(task.id) || new Set();
      callbacks.add(resolve);
      this.taskCallbacks.set(task.id, callbacks);

      // Add task to queue
      taskQueue.enqueue<T>({
        id: task.id,
        type: task.type,
        priority: task.priority,
        data: task.data,
        execute: async () => {
          const worker = await this.getAvailableWorker();
          if (!worker) {
            throw new Error('No workers available');
          }

          const workerInfo = this.workers.get(worker.id)!;
          workerInfo.status = 'busy';
          workerInfo.taskId = task.id;
          workerInfo.startTime = Date.now();

          // Send task to worker
          worker.worker.postMessage({
            type: 'execute',
            task: {
              id: task.id,
              type: task.type,
              data: task.data
            }
          }, task.transferables || []);

          return new Promise<T>((resolve, reject) => {
            const messageHandler = (event: MessageEvent<WorkerMessage>) => {
              const { type, taskId, data, error, progress } = event.data;

              if (taskId !== task.id) return;

              switch (type) {
                case 'result':
                  worker.worker.removeEventListener('message', messageHandler);
                  this.handleTaskCompletion(worker.id, taskId);
                  resolve(data);
                  break;

                case 'error':
                  worker.worker.removeEventListener('message', messageHandler);
                  this.handleTaskError(worker.id, taskId, error || new Error('Unknown error'));
                  reject(error || new Error('Unknown error'));
                  break;

                case 'progress':
                  if (task.onProgress && progress !== undefined) {
                    task.onProgress(progress);
                  }
                  break;
              }
            };

            worker.worker.addEventListener('message', messageHandler);
          });
        },
        onProgress: task.onProgress,
        maxRetries: task.maxRetries,
        timeout: task.timeout,
        dependencies: task.dependencies
      });
    });
  }

  /**
   * Get worker pool statistics
   */
  getStats(): WorkerStats {
    const activeWorkers = Array.from(this.workers.values())
      .filter(w => w.status === 'busy').length;

    const completedTasks = Array.from(this.workers.values())
      .reduce((sum, w) => sum + w.taskCount, 0);

    const failedTasks = Array.from(this.workers.values())
      .reduce((sum, w) => sum + w.errors, 0);

    return {
      totalWorkers: this.workers.size,
      activeWorkers,
      completedTasks,
      failedTasks,
      averageProcessingTime: this.calculateAverageProcessingTime()
    };
  }

  /**
   * Terminate all workers
   */
  terminate(): void {
    this.workers.forEach(({ worker }) => worker.terminate());
    this.workers.clear();
    this.isInitialized = false;
  }

  /**
   * Create a new worker
   */
  private async createWorker(id: number): Promise<void> {
    // Create worker from inline script for better portability
    const workerScript = `
      self.onmessage = async (event) => {
        const { type, task } = event.data;
        
        if (type === 'execute') {
          try {
            // Execute task
            const result = await processTask(task);
            
            // Send result back
            self.postMessage({
              type: 'result',
              taskId: task.id,
              data: result
            });
          } catch (error) {
            self.postMessage({
              type: 'error',
              taskId: task.id,
              error: error.message
            });
          }
        }
      };

      async function processTask(task) {
        // Report progress periodically
        const reportProgress = (progress) => {
          self.postMessage({
            type: 'progress',
            taskId: task.id,
            progress
          });
        };

        // Process task based on type
        switch (task.type) {
          case 'tokenize':
            return processTokenization(task.data, reportProgress);
          case 'analyze':
            return processAnalysis(task.data, reportProgress);
          case 'transform':
            return processTransformation(task.data, reportProgress);
          default:
            throw new Error(\`Unknown task type: \${task.type}\`);
        }
      }

      // Task processing implementations
      async function processTokenization(data, reportProgress) {
        // Implement tokenization logic
        return data;
      }

      async function processAnalysis(data, reportProgress) {
        // Implement analysis logic
        return data;
      }

      async function processTransformation(data, reportProgress) {
        // Implement transformation logic
        return data;
      }
    `;

    const blob = new Blob([workerScript], { type: 'application/javascript' });
    const worker = new Worker(URL.createObjectURL(blob));

    this.workers.set(id, {
      worker,
      status: 'idle',
      taskCount: 0,
      errors: 0
    });
  }

  /**
   * Get available worker
   */
  private async getAvailableWorker(): Promise<{ id: number; worker: Worker } | null> {
    // Find idle worker
    for (const [id, info] of this.workers.entries()) {
      if (info.status === 'idle') {
        return { id, worker: info.worker };
      }
    }

    // Wait for a worker to become available
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        for (const [id, info] of this.workers.entries()) {
          if (info.status === 'idle') {
            clearInterval(checkInterval);
            resolve({ id, worker: info.worker });
            return;
          }
        }
      }, 100);
    });
  }

  /**
   * Handle task completion
   */
  private handleTaskCompletion(workerId: number, taskId: string): void {
    const workerInfo = this.workers.get(workerId)!;
    workerInfo.status = 'idle';
    workerInfo.taskId = undefined;
    workerInfo.taskCount++;

    if (workerInfo.startTime) {
      const processingTime = Date.now() - workerInfo.startTime;
      this.processingTimes.push(processingTime);
      // Keep only last 100 processing times
      if (this.processingTimes.length > 100) {
        this.processingTimes.shift();
      }
    }
  }

  /**
   * Handle task error
   */
  private handleTaskError(workerId: number, taskId: string, error: Error): void {
    const workerInfo = this.workers.get(workerId)!;
    workerInfo.status = 'idle';
    workerInfo.taskId = undefined;
    workerInfo.errors++;
  }

  /**
   * Calculate average processing time
   */
  private calculateAverageProcessingTime(): number {
    if (this.processingTimes.length === 0) return 0;
    return this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length;
  }
}

// Export singleton instance
export const workerPool = new WorkerPool();

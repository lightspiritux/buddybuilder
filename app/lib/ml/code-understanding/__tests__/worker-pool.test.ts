import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WorkerPool } from '../performance/worker-pool';
import { taskQueue } from '../performance/task-queue';

interface TestTask {
  id: string;
  type: string;
  priority: number;
  data: any;
  execute: () => Promise<any>;
  onProgress?: (progress: number) => void;
  maxRetries?: number;
  transferables?: ArrayBuffer[];
}

describe('WorkerPool', () => {
  let workerPool: WorkerPool;
  let mockWorker: any;
  let mockTaskQueue: any;

  beforeEach(() => {
    // Mock Worker
    mockWorker = {
      postMessage: vi.fn(),
      terminate: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    // Mock Worker constructor
    global.Worker = vi.fn().mockImplementation(() => mockWorker);

    // Mock URL.createObjectURL
    global.URL.createObjectURL = vi.fn().mockReturnValue('blob:worker-script');

    // Mock task queue
    mockTaskQueue = {
      enqueue: vi.fn()
    };

    vi.spyOn(taskQueue, 'enqueue').mockImplementation(mockTaskQueue.enqueue);

    workerPool = new WorkerPool(2); // Create pool with 2 workers
  });

  afterEach(() => {
    workerPool.terminate();
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize worker pool correctly', async () => {
      await workerPool.initialize();
      expect(global.Worker).toHaveBeenCalledTimes(2);
    });

    it('should handle initialization errors', async () => {
      global.Worker = vi.fn().mockImplementation(() => {
        throw new Error('Worker creation failed');
      });

      const pool = new WorkerPool(2);
      await expect(pool.initialize()).rejects.toThrow('Worker creation failed');
    });

    it('should not initialize twice', async () => {
      await workerPool.initialize();
      await workerPool.initialize();
      expect(global.Worker).toHaveBeenCalledTimes(2);
    });
  });

  describe('Task Execution', () => {
    beforeEach(async () => {
      await workerPool.initialize();
    });

    it('should execute task in worker', async () => {
      const task: TestTask = {
        id: '1',
        type: 'test',
        priority: 1,
        data: { value: 42 },
        execute: async () => ({ result: 42 })
      };

      const executePromise = workerPool.executeTask(task);

      // Simulate worker response
      const messageHandler = mockWorker.addEventListener.mock.calls[0][1];
      messageHandler({
        data: {
          type: 'result',
          taskId: task.id,
          data: { result: 42 }
        }
      });

      const result = await executePromise;
      expect(result).toEqual({ result: 42 });
      expect(mockWorker.postMessage).toHaveBeenCalled();
    });

    it('should handle task errors', async () => {
      const task: TestTask = {
        id: '1',
        type: 'test',
        priority: 1,
        data: { value: 42 },
        execute: async () => { throw new Error('Task failed'); }
      };

      const executePromise = workerPool.executeTask(task);

      // Simulate worker error
      const messageHandler = mockWorker.addEventListener.mock.calls[0][1];
      messageHandler({
        data: {
          type: 'error',
          taskId: task.id,
          error: 'Task failed'
        }
      });

      await expect(executePromise).rejects.toThrow('Task failed');
    });

    it('should report task progress', async () => {
      const onProgress = vi.fn();
      const task: TestTask = {
        id: '1',
        type: 'test',
        priority: 1,
        data: { value: 42 },
        execute: async () => ({ result: 42 }),
        onProgress
      };

      const executePromise = workerPool.executeTask(task);

      // Simulate progress updates
      const messageHandler = mockWorker.addEventListener.mock.calls[0][1];
      messageHandler({
        data: {
          type: 'progress',
          taskId: task.id,
          progress: 50
        }
      });

      // Simulate completion
      messageHandler({
        data: {
          type: 'result',
          taskId: task.id,
          data: { result: 42 }
        }
      });

      await executePromise;
      expect(onProgress).toHaveBeenCalledWith(50);
    });
  });

  describe('Worker Management', () => {
    beforeEach(async () => {
      await workerPool.initialize();
    });

    it('should distribute tasks among workers', async () => {
      const tasks: TestTask[] = [
        {
          id: '1',
          type: 'test',
          priority: 1,
          data: { value: 1 },
          execute: async () => ({ result: 1 })
        },
        {
          id: '2',
          type: 'test',
          priority: 1,
          data: { value: 2 },
          execute: async () => ({ result: 2 })
        }
      ];

      const promises = tasks.map(task => workerPool.executeTask(task));

      // Simulate worker responses
      tasks.forEach((task, index) => {
        const messageHandler = mockWorker.addEventListener.mock.calls[index][1];
        messageHandler({
          data: {
            type: 'result',
            taskId: task.id,
            data: { result: task.data.value }
          }
        });
      });

      await Promise.all(promises);
      expect(mockWorker.postMessage).toHaveBeenCalledTimes(2);
    });

    it('should handle worker termination', () => {
      workerPool.terminate();
      expect(mockWorker.terminate).toHaveBeenCalledTimes(2);
    });

    it('should handle worker errors', async () => {
      const task: TestTask = {
        id: '1',
        type: 'test',
        priority: 1,
        data: { value: 42 },
        execute: async () => { throw new Error('Worker error'); }
      };

      const executePromise = workerPool.executeTask(task);

      // Simulate worker error
      const messageHandler = mockWorker.addEventListener.mock.calls[0][1];
      messageHandler({
        data: {
          type: 'error',
          taskId: task.id,
          error: new Error('Worker error')
        }
      });

      await expect(executePromise).rejects.toThrow('Worker error');
    });
  });

  describe('Resource Management', () => {
    beforeEach(async () => {
      await workerPool.initialize();
    });

    it('should track worker statistics', async () => {
      const task: TestTask = {
        id: '1',
        type: 'test',
        priority: 1,
        data: { value: 42 },
        execute: async () => ({ result: 42 })
      };

      const executePromise = workerPool.executeTask(task);

      // Simulate worker response
      const messageHandler = mockWorker.addEventListener.mock.calls[0][1];
      messageHandler({
        data: {
          type: 'result',
          taskId: task.id,
          data: { result: 42 }
        }
      });

      await executePromise;

      const stats = workerPool.getStats();
      expect(stats.completedTasks).toBeGreaterThan(0);
    });

    it('should handle transferable objects', async () => {
      const buffer = new ArrayBuffer(8);
      const task: TestTask = {
        id: '1',
        type: 'test',
        priority: 1,
        data: { buffer },
        execute: async () => ({ result: 'success' }),
        transferables: [buffer]
      };

      await workerPool.executeTask(task);
      expect(mockWorker.postMessage).toHaveBeenCalledWith(
        expect.anything(),
        [buffer]
      );
    });
  });

  describe('Error Recovery', () => {
    beforeEach(async () => {
      await workerPool.initialize();
    });

    it('should retry failed tasks', async () => {
      const task: TestTask = {
        id: '1',
        type: 'test',
        priority: 1,
        data: { value: 42 },
        execute: async () => ({ result: 42 }),
        maxRetries: 2
      };

      const executePromise = workerPool.executeTask(task);

      // Simulate first failure
      const messageHandler = mockWorker.addEventListener.mock.calls[0][1];
      messageHandler({
        data: {
          type: 'error',
          taskId: task.id,
          error: 'Temporary failure'
        }
      });

      // Simulate success on retry
      messageHandler({
        data: {
          type: 'result',
          taskId: task.id,
          data: { result: 42 }
        }
      });

      const result = await executePromise;
      expect(result).toEqual({ result: 42 });
      expect(mockWorker.postMessage).toHaveBeenCalledTimes(2);
    });

    it('should handle worker crashes', async () => {
      const task: TestTask = {
        id: '1',
        type: 'test',
        priority: 1,
        data: { value: 42 },
        execute: async () => ({ result: 42 })
      };

      const executePromise = workerPool.executeTask(task);

      // Simulate worker crash
      mockWorker.terminate();

      // Simulate response from new worker
      const messageHandler = mockWorker.addEventListener.mock.calls[1][1];
      messageHandler({
        data: {
          type: 'result',
          taskId: task.id,
          data: { result: 42 }
        }
      });

      const result = await executePromise;
      expect(result).toEqual({ result: 42 });
    });
  });
});

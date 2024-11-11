import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TaskQueue, type Task } from '../performance/task-queue';

describe('TaskQueue', () => {
  let taskQueue: TaskQueue;

  beforeEach(() => {
    taskQueue = new TaskQueue(3); // Max 3 concurrent tasks
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Task Enqueuing', () => {
    it('should enqueue and execute tasks', async () => {
      const task: Task<number> = {
        id: '1',
        type: 'test',
        priority: 1,
        data: { value: 42 },
        execute: vi.fn().mockResolvedValue(42)
      };

      const result = await taskQueue.enqueue(task);
      expect(result).toBe(42);
      expect(task.execute).toHaveBeenCalled();
    });

    it('should handle multiple tasks with priorities', async () => {
      const executionOrder: number[] = [];
      const createTask = (id: string, priority: number): Task<number> => ({
        id,
        type: 'test',
        priority,
        data: { value: priority },
        execute: async () => {
          executionOrder.push(priority);
          return priority;
        }
      });

      const tasks = [
        createTask('1', 1),
        createTask('2', 3),
        createTask('3', 2)
      ];

      await Promise.all(tasks.map(task => taskQueue.enqueue(task)));

      // Higher priority tasks should be executed first
      expect(executionOrder[0]).toBe(3);
      expect(executionOrder[1]).toBe(2);
      expect(executionOrder[2]).toBe(1);
    });

    it('should respect concurrent task limit', async () => {
      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
      const running = new Set<string>();
      const maxConcurrent = 3;

      const createTask = (id: string): Task<void> => ({
        id,
        type: 'test',
        priority: 1,
        data: null,
        execute: async () => {
          running.add(id);
          expect(running.size).toBeLessThanOrEqual(maxConcurrent);
          await delay(50);
          running.delete(id);
        }
      });

      const tasks = Array.from({ length: 6 }, (_, i) => createTask(`task${i}`));
      await Promise.all(tasks.map(task => taskQueue.enqueue(task)));
    });
  });

  describe('Task Execution', () => {
    it('should handle task failures and retries', async () => {
      const execute = vi.fn()
        .mockRejectedValueOnce(new Error('First attempt failed'))
        .mockRejectedValueOnce(new Error('Second attempt failed'))
        .mockResolvedValueOnce('success');

      const task: Task<string> = {
        id: '1',
        type: 'test',
        priority: 1,
        data: null,
        execute,
        maxRetries: 3
      };

      const result = await taskQueue.enqueue(task);
      expect(result).toBe('success');
      expect(execute).toHaveBeenCalledTimes(3);
    });

    it('should handle task timeouts', async () => {
      const task: Task<void> = {
        id: '1',
        type: 'test',
        priority: 1,
        data: null,
        execute: async () => {
          await new Promise(resolve => setTimeout(resolve, 1000));
        },
        timeout: 50
      };

      await expect(taskQueue.enqueue(task)).rejects.toThrow('Task timeout');
    });

    it('should track task progress', async () => {
      const progressCallback = vi.fn();
      const task: Task<number> = {
        id: '1',
        type: 'test',
        priority: 1,
        data: null,
        execute: async () => 42,
        onProgress: progressCallback
      };

      await taskQueue.enqueue(task);
      expect(progressCallback).toHaveBeenCalled();
    });
  });

  describe('Task Dependencies', () => {
    it('should handle task dependencies', async () => {
      const executionOrder: string[] = [];
      const createTask = (id: string, dependencies?: string[]): Task<void> => ({
        id,
        type: 'test',
        priority: 1,
        data: null,
        dependencies,
        execute: async () => {
          executionOrder.push(id);
        }
      });

      const task1 = createTask('1');
      const task2 = createTask('2', ['1']);
      const task3 = createTask('3', ['2']);

      await Promise.all([
        taskQueue.enqueue(task3),
        taskQueue.enqueue(task2),
        taskQueue.enqueue(task1)
      ]);

      expect(executionOrder).toEqual(['1', '2', '3']);
    });

    it('should handle circular dependencies', async () => {
      const task1: Task<void> = {
        id: '1',
        type: 'test',
        priority: 1,
        data: null,
        dependencies: ['2'],
        execute: async () => {}
      };

      const task2: Task<void> = {
        id: '2',
        type: 'test',
        priority: 1,
        data: null,
        dependencies: ['1'],
        execute: async () => {}
      };

      await expect(Promise.all([
        taskQueue.enqueue(task1),
        taskQueue.enqueue(task2)
      ])).rejects.toThrow();
    });
  });

  describe('Queue Management', () => {
    it('should provide queue statistics', async () => {
      const task: Task<void> = {
        id: '1',
        type: 'test',
        priority: 1,
        data: null,
        execute: async () => {}
      };

      await taskQueue.enqueue(task);
      const stats = taskQueue.getStats();

      expect(stats.completed).toBe(1);
      expect(stats.failed).toBe(0);
      expect(stats.pending).toBe(0);
      expect(stats.running).toBe(0);
    });

    it('should clear completed tasks', async () => {
      const tasks = Array.from({ length: 3 }, (_, i): Task<void> => ({
        id: `${i}`,
        type: 'test',
        priority: 1,
        data: null,
        execute: async () => {}
      }));

      await Promise.all(tasks.map(task => taskQueue.enqueue(task)));
      taskQueue.clearCompleted();

      const stats = taskQueue.getStats();
      expect(stats.completed).toBe(0);
    });
  });

  describe('Resource Management', () => {
    it('should check resources before executing tasks', async () => {
      const checkResourcesSpy = vi.spyOn(taskQueue as any, 'checkResources');
      const task: Task<void> = {
        id: '1',
        type: 'test',
        priority: 1,
        data: null,
        execute: async () => {}
      };

      await taskQueue.enqueue(task);
      expect(checkResourcesSpy).toHaveBeenCalled();
    });

    it('should handle resource pressure', async () => {
      // Mock resource pressure
      vi.spyOn(taskQueue as any, 'checkResources')
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);

      const tasks = Array.from({ length: 2 }, (_, i): Task<void> => ({
        id: `${i}`,
        type: 'test',
        priority: 1,
        data: null,
        execute: async () => {}
      }));

      await Promise.all(tasks.map(task => taskQueue.enqueue(task)));
      const stats = taskQueue.getStats();

      expect(stats.completed).toBe(1);
      expect(stats.pending).toBe(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle task execution errors', async () => {
      const task: Task<void> = {
        id: '1',
        type: 'test',
        priority: 1,
        data: null,
        execute: async () => {
          throw new Error('Task failed');
        }
      };

      await expect(taskQueue.enqueue(task)).rejects.toThrow('Task failed');
      const stats = taskQueue.getStats();
      expect(stats.failed).toBe(1);
    });

    it('should handle dependency resolution errors', async () => {
      const task: Task<void> = {
        id: '1',
        type: 'test',
        priority: 1,
        data: null,
        dependencies: ['nonexistent'],
        execute: async () => {}
      };

      await expect(taskQueue.enqueue(task)).rejects.toThrow('Dependency');
    });
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PressureHandler } from '../performance/pressure-handler';
import { memoryTracker } from '../performance/memory-tracker';
import { resourceManager } from '../performance/resource-manager';
import { taskQueue } from '../performance/task-queue';
import { workerPool } from '../performance/worker-pool';

describe('PressureHandler', () => {
  let pressureHandler: PressureHandler;
  let mockMemoryTracker: any;
  let mockResourceManager: any;
  let mockTaskQueue: any;
  let mockWorkerPool: any;

  beforeEach(() => {
    // Mock memory tracker
    mockMemoryTracker = {
      getStats: vi.fn().mockReturnValue({
        usedJSHeapSize: 50 * 1024 * 1024,
        totalJSHeapSize: 100 * 1024 * 1024,
        jsHeapSizeLimit: 200 * 1024 * 1024,
        usage: 0.25
      }),
      suggestGC: vi.fn()
    };

    // Mock resource manager
    mockResourceManager = {
      getStats: vi.fn().mockReturnValue({
        usage: {
          memory: 50 * 1024 * 1024,
          cacheSize: 20 * 1024 * 1024,
          activeWorkers: 2,
          runningTasks: 5
        },
        limits: {
          maxMemory: 200 * 1024 * 1024,
          maxCacheSize: 50 * 1024 * 1024,
          maxWorkers: 4,
          maxConcurrentTasks: 10
        },
        pressure: 'low'
      }),
      forceCleanup: vi.fn()
    };

    // Mock task queue
    mockTaskQueue = {
      getStats: vi.fn().mockReturnValue({
        pending: 2,
        running: 5,
        completed: 10,
        failed: 1
      })
    };

    // Mock worker pool
    mockWorkerPool = {
      getStats: vi.fn().mockReturnValue({
        totalWorkers: 4,
        activeWorkers: 2,
        completedTasks: 15,
        failedTasks: 1
      }),
      terminate: vi.fn()
    };

    // Mock dependencies
    vi.spyOn(memoryTracker, 'getStats').mockImplementation(mockMemoryTracker.getStats);
    vi.spyOn(memoryTracker, 'suggestGC').mockImplementation(mockMemoryTracker.suggestGC);
    vi.spyOn(resourceManager, 'getStats').mockImplementation(mockResourceManager.getStats);
    vi.spyOn(resourceManager, 'forceCleanup').mockImplementation(mockResourceManager.forceCleanup);
    vi.spyOn(taskQueue, 'getStats').mockImplementation(mockTaskQueue.getStats);
    vi.spyOn(workerPool, 'getStats').mockImplementation(mockWorkerPool.getStats);
    vi.spyOn(workerPool, 'terminate').mockImplementation(mockWorkerPool.terminate);

    pressureHandler = new PressureHandler();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    pressureHandler.stopMonitoring();
  });

  describe('Pressure Monitoring', () => {
    it('should start and stop monitoring correctly', () => {
      const setIntervalSpy = vi.spyOn(global, 'setInterval');
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

      pressureHandler.startMonitoring();
      expect(setIntervalSpy).toHaveBeenCalled();

      pressureHandler.stopMonitoring();
      expect(clearIntervalSpy).toHaveBeenCalled();
    });

    it('should detect pressure changes', async () => {
      const pressureCallback = vi.fn();
      pressureHandler.onPressureChange(pressureCallback);

      // Simulate pressure change
      mockMemoryTracker.getStats.mockReturnValueOnce({
        usedJSHeapSize: 150 * 1024 * 1024,
        totalJSHeapSize: 180 * 1024 * 1024,
        jsHeapSizeLimit: 200 * 1024 * 1024,
        usage: 0.75
      });

      await pressureHandler.forcePressureCheck();
      expect(pressureCallback).toHaveBeenCalled();
    });
  });

  describe('Pressure State', () => {
    it('should calculate overall pressure correctly', async () => {
      // Simulate high memory pressure
      mockMemoryTracker.getStats.mockReturnValue({
        usedJSHeapSize: 170 * 1024 * 1024,
        totalJSHeapSize: 190 * 1024 * 1024,
        jsHeapSizeLimit: 200 * 1024 * 1024,
        usage: 0.85
      });

      await pressureHandler.forcePressureCheck();
      const state = pressureHandler.getPressureState();
      expect(state.overall).toBe('critical');
    });

    it('should track individual pressure components', async () => {
      // Simulate various pressure conditions
      mockMemoryTracker.getStats.mockReturnValue({ usage: 0.75 });
      mockTaskQueue.getStats.mockReturnValue({ running: 8, maxConcurrent: 10 });

      await pressureHandler.forcePressureCheck();
      const state = pressureHandler.getPressureState();

      expect(state.memory).toBe('moderate');
      expect(state.tasks).toBe('moderate');
    });
  });

  describe('Mitigation Strategies', () => {
    it('should execute mitigation strategies under pressure', async () => {
      const strategy = vi.fn();
      pressureHandler.addMitigationStrategy('test', strategy);

      // Simulate critical pressure
      mockMemoryTracker.getStats.mockReturnValue({ usage: 0.9 });
      await pressureHandler.forcePressureCheck();

      expect(strategy).toHaveBeenCalled();
    });

    it('should handle multiple mitigation strategies', async () => {
      const strategies = [
        { name: 'strategy1', fn: vi.fn() },
        { name: 'strategy2', fn: vi.fn() }
      ];

      strategies.forEach(({ name, fn }) => {
        pressureHandler.addMitigationStrategy(name, fn);
      });

      // Simulate critical pressure
      mockMemoryTracker.getStats.mockReturnValue({ usage: 0.9 });
      await pressureHandler.forcePressureCheck();

      strategies.forEach(({ fn }) => {
        expect(fn).toHaveBeenCalled();
      });
    });
  });

  describe('Recovery Actions', () => {
    it('should trigger recovery actions after pressure reduction', async () => {
      const pressureCallback = vi.fn();
      pressureHandler.onPressureChange(pressureCallback);

      // Simulate pressure spike and reduction
      mockMemoryTracker.getStats
        .mockReturnValueOnce({ usage: 0.9 }) // Critical
        .mockReturnValueOnce({ usage: 0.3 }); // Normal

      await pressureHandler.forcePressureCheck();
      expect(pressureCallback).toHaveBeenCalledTimes(1);

      // Check recovery
      await pressureHandler.forcePressureCheck();
      expect(pressureCallback).toHaveBeenCalledTimes(2);
    });

    it('should handle cleanup after pressure handling', async () => {
      // Simulate critical pressure
      mockMemoryTracker.getStats.mockReturnValue({ usage: 0.9 });
      await pressureHandler.forcePressureCheck();

      expect(mockResourceManager.forceCleanup).toHaveBeenCalled();
      expect(mockMemoryTracker.suggestGC).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle strategy execution errors', async () => {
      const errorStrategy = vi.fn().mockRejectedValue(new Error('Strategy failed'));
      pressureHandler.addMitigationStrategy('error', errorStrategy);

      // Simulate pressure
      mockMemoryTracker.getStats.mockReturnValue({ usage: 0.9 });
      
      // Should not throw
      await expect(pressureHandler.forcePressureCheck()).resolves.not.toThrow();
    });

    it('should continue executing strategies after error', async () => {
      const errorStrategy = vi.fn().mockRejectedValue(new Error('Strategy failed'));
      const validStrategy = vi.fn();

      pressureHandler.addMitigationStrategy('error', errorStrategy);
      pressureHandler.addMitigationStrategy('valid', validStrategy);

      // Simulate pressure
      mockMemoryTracker.getStats.mockReturnValue({ usage: 0.9 });
      await pressureHandler.forcePressureCheck();

      expect(validStrategy).toHaveBeenCalled();
    });
  });
});

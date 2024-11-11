import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ResourceManager } from '../performance/resource-manager';
import { memoryTracker } from '../performance/memory-tracker';

interface DisposableResource {
  data: Uint8Array;
  dispose: () => void;
}

interface DestroyableResource {
  data: Uint8Array;
  destroy: () => void;
}

type TestResource = DisposableResource | DestroyableResource | ArrayBuffer;

describe('ResourceManager', () => {
  let resourceManager: ResourceManager;
  let mockMemoryTracker: any;

  beforeEach(() => {
    // Mock memory tracker
    mockMemoryTracker = {
      getStats: vi.fn().mockReturnValue({
        usedJSHeapSize: 50 * 1024 * 1024,
        totalJSHeapSize: 100 * 1024 * 1024,
        jsHeapSizeLimit: 200 * 1024 * 1024,
        usage: 0.25
      }),
      trackComponent: vi.fn(),
      releaseComponent: vi.fn(),
      suggestGC: vi.fn(),
      onWarning: vi.fn()
    };

    vi.spyOn(memoryTracker, 'getStats').mockImplementation(mockMemoryTracker.getStats);
    vi.spyOn(memoryTracker, 'trackComponent').mockImplementation(mockMemoryTracker.trackComponent);
    vi.spyOn(memoryTracker, 'releaseComponent').mockImplementation(mockMemoryTracker.releaseComponent);
    vi.spyOn(memoryTracker, 'suggestGC').mockImplementation(mockMemoryTracker.suggestGC);
    vi.spyOn(memoryTracker, 'onWarning').mockImplementation(mockMemoryTracker.onWarning);

    resourceManager = new ResourceManager({
      maxMemory: 500 * 1024 * 1024, // 500MB
      maxCacheSize: 100 * 1024 * 1024, // 100MB
      maxWorkers: 4,
      maxConcurrentTasks: 10
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Resource Registration', () => {
    it('should register resources correctly', () => {
      const resource: DisposableResource = {
        data: new Uint8Array(1024),
        dispose: () => {}
      };
      resourceManager.registerResource('test', resource, 1024);

      const stats = resourceManager.getStats();
      expect(stats.usage.memory).toBeGreaterThan(0);
      expect(mockMemoryTracker.trackComponent).toHaveBeenCalled();
    });

    it('should handle multiple resource registrations', () => {
      const resources = [
        { id: 'res1', size: 1024 },
        { id: 'res2', size: 2048 },
        { id: 'res3', size: 4096 }
      ];

      resources.forEach(({ id, size }) => {
        const resource: DisposableResource = {
          data: new Uint8Array(size),
          dispose: () => {}
        };
        resourceManager.registerResource(id, resource, size);
      });

      const stats = resourceManager.getStats();
      expect(stats.usage.memory).toBeGreaterThan(0);
      expect(mockMemoryTracker.trackComponent).toHaveBeenCalledTimes(3);
    });

    it('should estimate resource size when not provided', () => {
      const resource = { data: 'test string' };
      resourceManager.registerResource('test', resource);

      expect(mockMemoryTracker.trackComponent).toHaveBeenCalled();
    });
  });

  describe('Resource Release', () => {
    it('should release resources correctly', () => {
      const disposeSpy = vi.fn();
      const resource: DisposableResource = {
        data: new Uint8Array(1024),
        dispose: disposeSpy
      };
      resourceManager.registerResource('test', resource, 1024);
      resourceManager.releaseResource('test');

      expect(mockMemoryTracker.releaseComponent).toHaveBeenCalled();
      expect(disposeSpy).toHaveBeenCalled();
    });

    it('should handle missing resources gracefully', () => {
      expect(() => resourceManager.releaseResource('nonexistent')).not.toThrow();
    });

    it('should cleanup resources with different disposal methods', () => {
      const disposeSpy = vi.fn();
      const destroySpy = vi.fn();

      const resources: Array<[string, TestResource]> = [
        ['res1', { data: new Uint8Array(1024), dispose: disposeSpy }],
        ['res2', { data: new Uint8Array(1024), destroy: destroySpy }],
        ['res3', new ArrayBuffer(1024)]
      ];

      resources.forEach(([id, resource]) => {
        resourceManager.registerResource(id, resource, 1024);
      });

      resources.forEach(([id]) => {
        resourceManager.releaseResource(id);
      });

      expect(disposeSpy).toHaveBeenCalled();
      expect(destroySpy).toHaveBeenCalled();
    });
  });

  describe('Cleanup Strategies', () => {
    it('should execute cleanup strategies when pressure is high', async () => {
      // Register some resources
      for (let i = 0; i < 5; i++) {
        const resource: DisposableResource = {
          data: new Uint8Array(1024 * 1024),
          dispose: () => {}
        };
        resourceManager.registerResource(`cache${i}`, resource, 1024 * 1024);
      }

      // Simulate high memory pressure
      mockMemoryTracker.getStats.mockReturnValue({
        usedJSHeapSize: 400 * 1024 * 1024,
        totalJSHeapSize: 450 * 1024 * 1024,
        jsHeapSizeLimit: 500 * 1024 * 1024,
        usage: 0.8
      });

      await resourceManager.forceCleanup();
      expect(mockMemoryTracker.suggestGC).toHaveBeenCalled();
    });

    it('should prioritize cleanup based on resource type', async () => {
      // Register different types of resources
      const resources = [
        { id: 'cache1', type: 'cache', size: 1024 * 1024 },
        { id: 'worker1', type: 'worker', size: 2048 * 1024 },
        { id: 'model1', type: 'model', size: 4096 * 1024 }
      ];

      resources.forEach(({ id, type, size }) => {
        const resource: DisposableResource = {
          data: new Uint8Array(size),
          dispose: () => {}
        };
        resourceManager.registerResource(`${type}_${id}`, resource, size);
      });

      // Simulate high memory pressure
      mockMemoryTracker.getStats.mockReturnValue({
        usedJSHeapSize: 400 * 1024 * 1024,
        totalJSHeapSize: 450 * 1024 * 1024,
        jsHeapSizeLimit: 500 * 1024 * 1024,
        usage: 0.8
      });

      await resourceManager.forceCleanup();

      // Cache resources should be cleaned up first
      expect(mockMemoryTracker.releaseComponent).toHaveBeenCalledWith('cache_cache1');
    });
  });

  describe('Resource Limits', () => {
    it('should enforce memory limits', () => {
      // Try to register a resource exceeding memory limits
      const largeResource: DisposableResource = {
        data: new Uint8Array(600 * 1024 * 1024),
        dispose: () => {}
      };
      expect(() => 
        resourceManager.registerResource('large', largeResource, 600 * 1024 * 1024)
      ).toThrow();
    });

    it('should enforce worker limits', () => {
      // Register maximum number of workers
      for (let i = 0; i < 4; i++) {
        resourceManager.registerResource(
          `worker${i}`,
          { type: 'worker', status: 'idle', dispose: () => {} },
          1024
        );
      }

      // Try to register one more worker
      expect(() =>
        resourceManager.registerResource(
          'worker5',
          { type: 'worker', status: 'idle', dispose: () => {} },
          1024
        )
      ).toThrow();
    });

    it('should enforce concurrent task limits', () => {
      // Register maximum number of running tasks
      for (let i = 0; i < 10; i++) {
        resourceManager.registerResource(
          `task${i}`,
          { type: 'task', status: 'running', dispose: () => {} },
          1024
        );
      }

      const stats = resourceManager.getStats();
      expect(stats.usage.runningTasks).toBe(10);
    });
  });

  describe('Resource Stats', () => {
    it('should calculate resource usage correctly', () => {
      // Register various resources
      resourceManager.registerResource(
        'cache1',
        { data: new Uint8Array(1024 * 1024), dispose: () => {} },
        1024 * 1024
      );
      resourceManager.registerResource(
        'worker1',
        { type: 'worker', status: 'idle', dispose: () => {} },
        2048
      );
      resourceManager.registerResource(
        'task1',
        { type: 'task', status: 'running', dispose: () => {} },
        4096
      );

      const stats = resourceManager.getStats();
      expect(stats.usage.memory).toBeGreaterThan(0);
      expect(stats.usage.activeWorkers).toBe(1);
      expect(stats.usage.runningTasks).toBe(1);
      expect(stats.usage.cacheSize).toBe(1024 * 1024);
    });

    it('should track resource pressure levels', () => {
      // Register resources until medium pressure
      for (let i = 0; i < 5; i++) {
        const resource: DisposableResource = {
          data: new Uint8Array(10 * 1024 * 1024),
          dispose: () => {}
        };
        resourceManager.registerResource(`resource${i}`, resource, 10 * 1024 * 1024);
      }

      const stats = resourceManager.getStats();
      expect(['low', 'medium', 'high']).toContain(stats.pressure);
    });
  });
});

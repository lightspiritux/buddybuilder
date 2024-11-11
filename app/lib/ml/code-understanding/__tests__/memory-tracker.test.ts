import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryTracker } from '../performance/memory-tracker';

describe('MemoryTracker', () => {
  let memoryTracker: MemoryTracker;
  let mockPerformance: any;

  beforeEach(() => {
    // Mock performance.memory
    mockPerformance = {
      memory: {
        usedJSHeapSize: 50 * 1024 * 1024, // 50MB
        totalJSHeapSize: 100 * 1024 * 1024, // 100MB
        jsHeapSizeLimit: 200 * 1024 * 1024 // 200MB
      }
    };
    global.performance = mockPerformance;

    memoryTracker = new MemoryTracker({
      warning: 0.7,
      critical: 0.85,
      limit: 0.95
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (memoryTracker) {
      memoryTracker.stopTracking();
    }
  });

  describe('Memory Tracking', () => {
    it('should start and stop tracking', () => {
      const setIntervalSpy = vi.spyOn(global, 'setInterval');
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

      memoryTracker.startTracking();
      expect(setIntervalSpy).toHaveBeenCalled();

      memoryTracker.stopTracking();
      expect(clearIntervalSpy).toHaveBeenCalled();
    });

    it('should track memory usage correctly', () => {
      memoryTracker.startTracking();
      const stats = memoryTracker.getStats();

      expect(stats).toBeDefined();
      expect(stats.usedJSHeapSize).toBe(mockPerformance.memory.usedJSHeapSize);
      expect(stats.totalJSHeapSize).toBe(mockPerformance.memory.totalJSHeapSize);
      expect(stats.jsHeapSizeLimit).toBe(mockPerformance.memory.jsHeapSizeLimit);
      expect(stats.usage).toBe(mockPerformance.memory.usedJSHeapSize / mockPerformance.memory.jsHeapSizeLimit);
    });

    it('should handle missing performance.memory API', () => {
      // Remove memory API
      delete global.performance.memory;

      const consoleSpy = vi.spyOn(console, 'warn');
      memoryTracker.startTracking();

      expect(consoleSpy).toHaveBeenCalledWith('Memory API not available');
    });
  });

  describe('Warning System', () => {
    it('should trigger warning callback when threshold is exceeded', () => {
      const warningCallback = vi.fn();
      memoryTracker.onWarning(warningCallback);

      // Simulate high memory usage
      mockPerformance.memory.usedJSHeapSize = 150 * 1024 * 1024; // 75% usage
      memoryTracker.startTracking();

      // Force memory check
      const stats = memoryTracker.getStats();
      expect(warningCallback).toHaveBeenCalledWith(stats, 'warning');
    });

    it('should trigger critical callback when threshold is exceeded', () => {
      const warningCallback = vi.fn();
      memoryTracker.onWarning(warningCallback);

      // Simulate critical memory usage
      mockPerformance.memory.usedJSHeapSize = 180 * 1024 * 1024; // 90% usage
      memoryTracker.startTracking();

      // Force memory check
      const stats = memoryTracker.getStats();
      expect(warningCallback).toHaveBeenCalledWith(stats, 'critical');
    });

    it('should allow removing warning callbacks', () => {
      const warningCallback = vi.fn();
      const removeCallback = memoryTracker.onWarning(warningCallback);

      removeCallback();

      // Simulate high memory usage
      mockPerformance.memory.usedJSHeapSize = 150 * 1024 * 1024;
      memoryTracker.startTracking();

      // Force memory check
      memoryTracker.getStats();
      expect(warningCallback).not.toHaveBeenCalled();
    });
  });

  describe('Component Tracking', () => {
    it('should track component memory usage', () => {
      memoryTracker.trackComponent('testComponent', 1024 * 1024); // 1MB
      const stats = memoryTracker.getStats();

      expect(stats.usedJSHeapSize).toBeGreaterThan(mockPerformance.memory.usedJSHeapSize);
    });

    it('should release component memory', () => {
      memoryTracker.trackComponent('testComponent', 1024 * 1024);
      memoryTracker.releaseComponent('testComponent');

      const stats = memoryTracker.getStats();
      expect(stats.usedJSHeapSize).toBe(mockPerformance.memory.usedJSHeapSize);
    });

    it('should handle multiple components', () => {
      memoryTracker.trackComponent('component1', 1024 * 1024); // 1MB
      memoryTracker.trackComponent('component2', 2048 * 1024); // 2MB

      const stats = memoryTracker.getStats();
      expect(stats.usedJSHeapSize).toBe(mockPerformance.memory.usedJSHeapSize + 3 * 1024 * 1024);
    });
  });

  describe('Garbage Collection', () => {
    it('should suggest garbage collection when needed', () => {
      const gcCallback = vi.fn();
      memoryTracker.onGCTrigger(gcCallback);

      // Simulate critical memory usage
      mockPerformance.memory.usedJSHeapSize = 180 * 1024 * 1024; // 90% usage
      memoryTracker.startTracking();

      // Force memory check
      memoryTracker.getStats();
      expect(gcCallback).toHaveBeenCalled();
    });

    it('should handle missing gc function', () => {
      const originalGc = global.gc;
      delete global.gc;

      memoryTracker.suggestGC(); // Should not throw

      if (originalGc) {
        global.gc = originalGc;
      }
    });
  });

  describe('Memory History', () => {
    it('should maintain memory usage history', () => {
      memoryTracker.startTracking();

      // Simulate memory changes
      mockPerformance.memory.usedJSHeapSize = 60 * 1024 * 1024;
      memoryTracker.getStats();

      mockPerformance.memory.usedJSHeapSize = 70 * 1024 * 1024;
      memoryTracker.getStats();

      const history = memoryTracker.getHistory();
      expect(history.length).toBeGreaterThan(0);
      expect(history[history.length - 1].usedJSHeapSize).toBe(70 * 1024 * 1024);
    });

    it('should limit history size', () => {
      memoryTracker.startTracking();

      // Generate many entries
      for (let i = 0; i < 200; i++) {
        mockPerformance.memory.usedJSHeapSize = (50 + i) * 1024 * 1024;
        memoryTracker.getStats();
      }

      const history = memoryTracker.getHistory();
      expect(history.length).toBeLessThanOrEqual(100); // Default max length
    });
  });

  describe('Memory Pressure', () => {
    it('should detect memory pressure correctly', () => {
      const warningCallback = vi.fn();
      memoryTracker.onWarning(warningCallback);

      // Simulate increasing memory pressure
      const pressureLevels = [
        { used: 100 * 1024 * 1024, expected: 'normal' }, // 50%
        { used: 140 * 1024 * 1024, expected: 'warning' }, // 70%
        { used: 170 * 1024 * 1024, expected: 'critical' } // 85%
      ];

      pressureLevels.forEach(({ used, expected }) => {
        mockPerformance.memory.usedJSHeapSize = used;
        memoryTracker.getStats();

        if (expected !== 'normal') {
          expect(warningCallback).toHaveBeenCalledWith(
            expect.anything(),
            expected
          );
        }
      });
    });

    it('should handle rapid memory changes', () => {
      const warningCallback = vi.fn();
      memoryTracker.onWarning(warningCallback);

      // Simulate rapid memory changes
      for (let i = 0; i < 10; i++) {
        mockPerformance.memory.usedJSHeapSize = (100 + i * 10) * 1024 * 1024;
        memoryTracker.getStats();
      }

      expect(warningCallback).toHaveBeenCalled();
    });
  });
});

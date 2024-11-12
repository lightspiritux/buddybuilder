import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PythonWasmRuntime } from '../wasm-runtime';

// Mock window.loadPyodide
const mockRunPython = vi.fn();
const mockLoadPackage = vi.fn();
const mockPyodide = {
  runPython: mockRunPython,
  loadPackage: mockLoadPackage,
  globals: {}
};

vi.stubGlobal('loadPyodide', () => Promise.resolve(mockPyodide));

// Mock metrics collector
vi.mock('../../../ml/code-understanding/telemetry/metrics-collector', () => ({
  metricsCollector: {
    record: vi.fn(),
    registerMetric: vi.fn()
  },
  MetricType: {
    COUNTER: 'counter'
  },
  MetricCategory: {
    SYSTEM: 'system'
  }
}));

// Mock performance tracker
vi.mock('../../../ml/code-understanding/telemetry/performance-tracker', () => ({
  performanceTracker: {
    startOperation: vi.fn(() => 'operation-id'),
    endOperation: vi.fn()
  },
  OperationType: {
    RESOURCE_CLEANUP: 'resource_cleanup',
    WORKER_TASK: 'worker_task'
  }
}));

describe('PythonWasmRuntime', () => {
  let runtime: PythonWasmRuntime;

  beforeEach(() => {
    runtime = PythonWasmRuntime.getInstance();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      await expect(runtime.initialize()).resolves.not.toThrow();
      expect(mockLoadPackage).not.toHaveBeenCalled();
    });

    it('should load specified packages during initialization', async () => {
      const packagesRuntime = PythonWasmRuntime.getInstance({
        packages: ['numpy', 'pandas']
      });

      await packagesRuntime.initialize();
      expect(mockLoadPackage).toHaveBeenCalledWith(['numpy', 'pandas']);
    });

    it('should set up virtual environment if specified', async () => {
      const venvRuntime = PythonWasmRuntime.getInstance({
        virtualEnv: 'test-env'
      });

      mockRunPython.mockImplementationOnce(() => undefined);
      await venvRuntime.initialize();

      expect(mockRunPython).toHaveBeenCalledWith(expect.stringContaining('test-env'));
    });
  });

  describe('Code Execution', () => {
    beforeEach(async () => {
      await runtime.initialize();
    });

    it('should execute Python code successfully', async () => {
      const code = 'print("Hello, World!")';
      mockRunPython.mockReturnValueOnce('Hello, World!');

      const result = await runtime.executeCode(code);
      expect(result).toBe('Hello, World!');
      expect(mockRunPython).toHaveBeenCalledWith(code);
    });

    it('should handle execution errors', async () => {
      const code = 'invalid python code';
      mockRunPython.mockRejectedValueOnce(new Error('SyntaxError'));

      await expect(runtime.executeCode(code)).rejects.toThrow();
    });

    it('should throw if not initialized', async () => {
      const uninitializedRuntime = PythonWasmRuntime.getInstance();
      await expect(uninitializedRuntime.executeCode('print("test")')).rejects.toThrow();
    });
  });

  describe('Package Management', () => {
    beforeEach(async () => {
      await runtime.initialize();
    });

    it('should install packages successfully', async () => {
      mockLoadPackage.mockResolvedValueOnce(undefined);
      await expect(runtime.installPackage('numpy')).resolves.not.toThrow();
      expect(mockLoadPackage).toHaveBeenCalledWith(['numpy']);
    });

    it('should handle package installation errors', async () => {
      mockLoadPackage.mockRejectedValueOnce(new Error('Package not found'));
      await expect(runtime.installPackage('invalid-package')).rejects.toThrow();
    });

    it('should throw if not initialized', async () => {
      const uninitializedRuntime = PythonWasmRuntime.getInstance();
      await expect(uninitializedRuntime.installPackage('numpy')).rejects.toThrow();
    });
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = PythonWasmRuntime.getInstance();
      const instance2 = PythonWasmRuntime.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should maintain configuration across instances', async () => {
      const configuredRuntime = PythonWasmRuntime.getInstance({
        packages: ['numpy']
      });
      await configuredRuntime.initialize();

      const sameRuntime = PythonWasmRuntime.getInstance();
      expect(mockLoadPackage).toHaveBeenCalledWith(['numpy']);
    });
  });
});

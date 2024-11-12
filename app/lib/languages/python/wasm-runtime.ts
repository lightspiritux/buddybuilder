import { metricsCollector, MetricType, MetricCategory } from '../../ml/code-understanding/telemetry/metrics-collector';
import { performanceTracker, OperationType } from '../../ml/code-understanding/telemetry/performance-tracker';

interface PyodideInstance {
  runPython: (code: string) => any;
  loadPackage: (packages: string[]) => Promise<void>;
  globals: Record<string, any>;
}

declare global {
  interface Window {
    loadPyodide: () => Promise<PyodideInstance>;
  }
}

interface RuntimeConfig {
  packages?: string[];
  virtualEnv?: string;
}

export class PythonWasmRuntime {
  private static instance: PythonWasmRuntime;
  private pyodide: PyodideInstance | null = null;
  private initialized = false;
  private config: RuntimeConfig;

  private constructor(config: RuntimeConfig = {}) {
    this.config = config;
    this.initializeMetrics();
  }

  static getInstance(config: RuntimeConfig = {}): PythonWasmRuntime {
    if (!PythonWasmRuntime.instance) {
      PythonWasmRuntime.instance = new PythonWasmRuntime(config);
    }
    return PythonWasmRuntime.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const operationId = performanceTracker.startOperation({
      component: 'PythonWasmRuntime',
      operation: OperationType.RESOURCE_CLEANUP
    });

    try {
      // Load Pyodide script
      await this.loadPyodideScript();

      // Initialize Pyodide
      this.pyodide = await window.loadPyodide();

      // Load required packages
      if (this.config.packages?.length) {
        await this.pyodide.loadPackage(this.config.packages);
      }

      // Set up virtual environment if specified
      if (this.config.virtualEnv) {
        await this.setupVirtualEnv(this.config.virtualEnv);
      }

      this.initialized = true;

      metricsCollector.record('python_wasm_runtime_initialized', 1, {
        category: MetricCategory.SYSTEM
      });
    } catch (error) {
      metricsCollector.record('python_wasm_runtime_initialization_failed', 1, {
        category: MetricCategory.SYSTEM
      });
      throw error;
    } finally {
      performanceTracker.endOperation(operationId, {
        component: 'PythonWasmRuntime',
        operation: OperationType.RESOURCE_CLEANUP
      });
    }
  }

  async executeCode(code: string): Promise<any> {
    if (!this.initialized || !this.pyodide) {
      throw new Error('Python WASM runtime not initialized');
    }

    const operationId = performanceTracker.startOperation({
      component: 'PythonWasmRuntime',
      operation: OperationType.WORKER_TASK
    });

    try {
      const result = await this.pyodide.runPython(code);

      metricsCollector.record('python_code_execution_success', 1, {
        category: MetricCategory.SYSTEM
      });

      return result;
    } catch (error) {
      metricsCollector.record('python_code_execution_failed', 1, {
        category: MetricCategory.SYSTEM
      });
      throw error;
    } finally {
      performanceTracker.endOperation(operationId, {
        component: 'PythonWasmRuntime',
        operation: OperationType.WORKER_TASK
      });
    }
  }

  async installPackage(packageName: string): Promise<void> {
    if (!this.initialized || !this.pyodide) {
      throw new Error('Python WASM runtime not initialized');
    }

    const operationId = performanceTracker.startOperation({
      component: 'PythonWasmRuntime',
      operation: OperationType.RESOURCE_CLEANUP
    });

    try {
      await this.pyodide.loadPackage([packageName]);

      metricsCollector.record('python_package_installation_success', 1, {
        category: MetricCategory.SYSTEM
      });
    } catch (error) {
      metricsCollector.record('python_package_installation_failed', 1, {
        category: MetricCategory.SYSTEM
      });
      throw error;
    } finally {
      performanceTracker.endOperation(operationId, {
        component: 'PythonWasmRuntime',
        operation: OperationType.RESOURCE_CLEANUP
      });
    }
  }

  private async loadPyodideScript(): Promise<void> {
    if (typeof window.loadPyodide === 'function') {
      return;
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Pyodide'));
      document.head.appendChild(script);
    });
  }

  private async setupVirtualEnv(name: string): Promise<void> {
    if (!this.pyodide) {
      throw new Error('Pyodide not initialized');
    }

    const setupCode = `
      import venv
      import sys
      
      venv.create('${name}', with_pip=True)
      sys.prefix = '${name}'
    `;

    await this.pyodide.runPython(setupCode);
  }

  private initializeMetrics(): void {
    metricsCollector.registerMetric({
      name: 'python_wasm_runtime_initialized',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of successful WASM runtime initializations'
    });

    metricsCollector.registerMetric({
      name: 'python_wasm_runtime_initialization_failed',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of failed WASM runtime initializations'
    });

    metricsCollector.registerMetric({
      name: 'python_code_execution_success',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of successful Python code executions'
    });

    metricsCollector.registerMetric({
      name: 'python_code_execution_failed',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of failed Python code executions'
    });

    metricsCollector.registerMetric({
      name: 'python_package_installation_success',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of successful Python package installations'
    });

    metricsCollector.registerMetric({
      name: 'python_package_installation_failed',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of failed Python package installations'
    });
  }
}

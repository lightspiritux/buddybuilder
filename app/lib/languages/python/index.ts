import { metricsCollector, MetricType, MetricCategory } from '../../ml/code-understanding/telemetry/metrics-collector';
import { performanceTracker, OperationType } from '../../ml/code-understanding/telemetry/performance-tracker';
import { PythonRuntime } from './runtime';
import { PythonPackageManager } from './package-manager';
import { PythonBuildSystem } from './build-system';

interface PythonConfig {
  virtualEnv?: string;
  pythonPath?: string;
  outputDir?: string;
  requirements?: string[];
  env?: Record<string, string>;
}

interface ExecutionResult {
  success: boolean;
  output: string;
  errors: string[];
  artifacts: string[];
}

export class PythonSupport {
  private static instance: PythonSupport;
  private runtime: PythonRuntime;
  private packageManager: PythonPackageManager;
  private buildSystem: PythonBuildSystem;

  private constructor(config: PythonConfig = {}) {
    this.runtime = PythonRuntime.getInstance({
      virtualEnv: config.virtualEnv,
      pythonPath: config.pythonPath
    });
    this.packageManager = PythonPackageManager.getInstance({
      virtualEnvPath: config.virtualEnv,
      pythonPath: config.pythonPath
    });
    this.buildSystem = PythonBuildSystem.getInstance();
    this.initializeMetrics();
  }

  static getInstance(config: PythonConfig = {}): PythonSupport {
    if (!PythonSupport.instance) {
      PythonSupport.instance = new PythonSupport(config);
    }
    return PythonSupport.instance;
  }

  async initialize(): Promise<void> {
    const operationId = performanceTracker.startOperation({
      component: 'PythonSupport',
      operation: OperationType.RESOURCE_CLEANUP
    });

    try {
      // Initialize all components
      await Promise.all([
        this.runtime.initialize(),
        this.packageManager.initialize()
      ]);

      metricsCollector.record('python_support_initialized', 1, {
        category: MetricCategory.SYSTEM
      });
    } catch (error) {
      metricsCollector.record('python_support_initialization_failed', 1, {
        category: MetricCategory.SYSTEM
      });
      throw error;
    } finally {
      performanceTracker.endOperation(operationId, {
        component: 'PythonSupport',
        operation: OperationType.RESOURCE_CLEANUP
      });
    }
  }

  async executeCode(code: string, config: PythonConfig = {}): Promise<ExecutionResult> {
    const operationId = performanceTracker.startOperation({
      component: 'PythonSupport',
      operation: OperationType.CODE_COMPLETION
    });

    try {
      // Install any required packages
      if (config.requirements?.length) {
        await Promise.all(
          config.requirements.map(pkg => this.packageManager.installPackage(pkg))
        );
      }

      // Execute the code
      const result = await this.runtime.executeCode(code);

      metricsCollector.record('python_code_execution_completed', 1, {
        category: MetricCategory.SYSTEM
      });

      return {
        success: result.exitCode === 0,
        output: result.stdout,
        errors: result.stderr ? [result.stderr] : [],
        artifacts: []
      };
    } catch (error) {
      metricsCollector.record('python_code_execution_failed', 1, {
        category: MetricCategory.SYSTEM
      });

      return {
        success: false,
        output: '',
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        artifacts: []
      };
    } finally {
      performanceTracker.endOperation(operationId, {
        component: 'PythonSupport',
        operation: OperationType.CODE_COMPLETION
      });
    }
  }

  async buildProject(entryPoint: string, config: PythonConfig = {}): Promise<ExecutionResult> {
    const operationId = performanceTracker.startOperation({
      component: 'PythonSupport',
      operation: OperationType.WORKER_TASK
    });

    try {
      const buildResult = await this.buildSystem.build({
        entryPoint,
        outputDir: config.outputDir || 'dist',
        requirements: config.requirements,
        env: config.env
      });

      metricsCollector.record('python_project_build_completed', 1, {
        category: MetricCategory.SYSTEM
      });

      return buildResult;
    } catch (error) {
      metricsCollector.record('python_project_build_failed', 1, {
        category: MetricCategory.SYSTEM
      });

      return {
        success: false,
        output: '',
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        artifacts: []
      };
    } finally {
      performanceTracker.endOperation(operationId, {
        component: 'PythonSupport',
        operation: OperationType.WORKER_TASK
      });
    }
  }

  private initializeMetrics(): void {
    metricsCollector.registerMetric({
      name: 'python_support_initialized',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of successful Python support initializations'
    });

    metricsCollector.registerMetric({
      name: 'python_support_initialization_failed',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of failed Python support initializations'
    });

    metricsCollector.registerMetric({
      name: 'python_code_execution_completed',
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
      name: 'python_project_build_completed',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of successful Python project builds'
    });

    metricsCollector.registerMetric({
      name: 'python_project_build_failed',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of failed Python project builds'
    });
  }
}

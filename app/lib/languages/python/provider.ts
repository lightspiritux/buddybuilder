import { LanguageSupport } from '@codemirror/language';
import { python } from '@codemirror/lang-python';
import { PythonEditorIntegration } from './editor-integration';
import { metricsCollector, MetricType, MetricCategory } from '../../ml/code-understanding/telemetry/metrics-collector';
import { performanceTracker, OperationType } from '../../ml/code-understanding/telemetry/performance-tracker';

interface LanguageProviderConfig {
  pythonPath?: string;
  virtualEnv?: string;
  extraPaths?: string[];
}

export class PythonLanguageProvider {
  private static instance: PythonLanguageProvider;
  private editorIntegration: PythonEditorIntegration;
  private initialized: boolean = false;

  private constructor(config: LanguageProviderConfig = {}) {
    this.editorIntegration = PythonEditorIntegration.getInstance(config);
    this.initializeMetrics();
  }

  static getInstance(config: LanguageProviderConfig = {}): PythonLanguageProvider {
    if (!PythonLanguageProvider.instance) {
      PythonLanguageProvider.instance = new PythonLanguageProvider(config);
    }
    return PythonLanguageProvider.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const operationId = performanceTracker.startOperation({
      component: 'PythonLanguageProvider',
      operation: OperationType.RESOURCE_CLEANUP
    });

    try {
      await this.editorIntegration.initialize();
      this.initialized = true;

      metricsCollector.record('python_provider_initialized', 1, {
        category: MetricCategory.SYSTEM
      });
    } catch (error) {
      metricsCollector.record('python_provider_initialization_failed', 1, {
        category: MetricCategory.SYSTEM
      });
      throw error;
    } finally {
      performanceTracker.endOperation(operationId, {
        component: 'PythonLanguageProvider',
        operation: OperationType.RESOURCE_CLEANUP
      });
    }
  }

  getLanguageSupport(): LanguageSupport {
    if (!this.initialized) {
      throw new Error('Python language provider not initialized');
    }

    const operationId = performanceTracker.startOperation({
      component: 'PythonLanguageProvider',
      operation: OperationType.WORKER_TASK
    });

    try {
      // Create language support with Python language and our extensions
      const support = new LanguageSupport(
        python().language,
        this.editorIntegration.getExtensions()
      );
      
      metricsCollector.record('python_language_support_created', 1, {
        category: MetricCategory.SYSTEM
      });

      return support;
    } catch (error) {
      metricsCollector.record('python_language_support_creation_failed', 1, {
        category: MetricCategory.SYSTEM
      });
      throw error;
    } finally {
      performanceTracker.endOperation(operationId, {
        component: 'PythonLanguageProvider',
        operation: OperationType.WORKER_TASK
      });
    }
  }

  private initializeMetrics(): void {
    metricsCollector.registerMetric({
      name: 'python_provider_initialized',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of successful Python provider initializations'
    });

    metricsCollector.registerMetric({
      name: 'python_provider_initialization_failed',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of failed Python provider initializations'
    });

    metricsCollector.registerMetric({
      name: 'python_language_support_created',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of Python language supports created'
    });

    metricsCollector.registerMetric({
      name: 'python_language_support_creation_failed',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of failed Python language support creations'
    });
  }
}

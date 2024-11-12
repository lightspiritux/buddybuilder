import { Extension } from '@codemirror/state';
import { PythonLanguageProvider } from './provider';
import { metricsCollector, MetricType, MetricCategory } from '../../ml/code-understanding/telemetry/metrics-collector';
import { performanceTracker, OperationType } from '../../ml/code-understanding/telemetry/performance-tracker';

interface PythonRegistrationConfig {
  pythonPath?: string;
  virtualEnv?: string;
  extraPaths?: string[];
}

/**
 * Register Python language support in the editor
 * 
 * This function initializes and configures Python language support,
 * including syntax highlighting, code completion, linting, and other
 * Python-specific features.
 */
export async function registerPythonSupport(
  config: PythonRegistrationConfig = {}
): Promise<Extension> {
  const operationId = performanceTracker.startOperation({
    component: 'PythonRegistration',
    operation: OperationType.RESOURCE_CLEANUP
  });

  try {
    // Initialize the language provider
    const provider = PythonLanguageProvider.getInstance(config);
    await provider.initialize();

    // Get the language support
    const support = provider.getLanguageSupport();

    metricsCollector.record('python_support_registered', 1, {
      category: MetricCategory.SYSTEM
    });

    return support;
  } catch (error) {
    metricsCollector.record('python_support_registration_failed', 1, {
      category: MetricCategory.SYSTEM
    });
    throw error;
  } finally {
    performanceTracker.endOperation(operationId, {
      component: 'PythonRegistration',
      operation: OperationType.RESOURCE_CLEANUP
    });
  }
}

// Initialize metrics
metricsCollector.registerMetric({
  name: 'python_support_registered',
  type: MetricType.COUNTER,
  category: MetricCategory.SYSTEM,
  description: 'Number of successful Python support registrations'
});

metricsCollector.registerMetric({
  name: 'python_support_registration_failed',
  type: MetricType.COUNTER,
  category: MetricCategory.SYSTEM,
  description: 'Number of failed Python support registrations'
});

// Export everything needed for Python support
export * from './runtime';
export * from './package-manager';
export * from './build-system';
export * from './language-service';
export * from './editor-integration';
export * from './provider';

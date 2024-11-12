import { Extension } from '@codemirror/state';
import { CompletionContext, CompletionResult, autocompletion } from '@codemirror/autocomplete';
import { linter, Diagnostic } from '@codemirror/lint';
import { python } from '@codemirror/lang-python';
import { PythonLanguageService } from './language-service';
import { metricsCollector, MetricType, MetricCategory } from '../../ml/code-understanding/telemetry/metrics-collector';
import { performanceTracker, OperationType } from '../../ml/code-understanding/telemetry/performance-tracker';

interface EditorIntegrationConfig {
  pythonPath?: string;
  virtualEnv?: string;
  extraPaths?: string[];
}

export class PythonEditorIntegration {
  private static instance: PythonEditorIntegration;
  private languageService: PythonLanguageService;

  private constructor(config: EditorIntegrationConfig = {}) {
    this.languageService = PythonLanguageService.getInstance(config);
    this.initializeMetrics();
  }

  static getInstance(config: EditorIntegrationConfig = {}): PythonEditorIntegration {
    if (!PythonEditorIntegration.instance) {
      PythonEditorIntegration.instance = new PythonEditorIntegration(config);
    }
    return PythonEditorIntegration.instance;
  }

  async initialize(): Promise<void> {
    const operationId = performanceTracker.startOperation({
      component: 'PythonEditorIntegration',
      operation: OperationType.RESOURCE_CLEANUP
    });

    try {
      await this.languageService.initialize();
      metricsCollector.record('python_editor_integration_initialized', 1, {
        category: MetricCategory.SYSTEM
      });
    } catch (error) {
      metricsCollector.record('python_editor_integration_initialization_failed', 1, {
        category: MetricCategory.SYSTEM
      });
      throw error;
    } finally {
      performanceTracker.endOperation(operationId, {
        component: 'PythonEditorIntegration',
        operation: OperationType.RESOURCE_CLEANUP
      });
    }
  }

  getExtensions(): Extension[] {
    return [
      python(),
      this.createCompletionExtension(),
      this.createLinterExtension(),
      this.createFormattingExtension()
    ];
  }

  private createCompletionExtension(): Extension {
    return autocompletion({
      override: [this.completionSource.bind(this)]
    });
  }

  private createLinterExtension(): Extension {
    return linter(this.linterSource.bind(this));
  }

  private createFormattingExtension(): Extension {
    // Implementation will use Python's black formatter
    // For now, return an empty extension
    return [];
  }

  private async completionSource(context: CompletionContext): Promise<CompletionResult | null> {
    const operationId = performanceTracker.startOperation({
      component: 'PythonEditorIntegration',
      operation: OperationType.CODE_COMPLETION
    });

    try {
      const { state, pos } = context;
      const doc = state.doc;
      const line = doc.lineAt(pos);
      
      const completions = await this.languageService.getCompletions(doc.toString(), {
        line: line.number - 1,
        column: pos - line.from
      });

      metricsCollector.record('python_completion_items_provided', completions.length, {
        category: MetricCategory.SYSTEM
      });

      return {
        from: pos,
        options: completions.map(item => ({
          label: item.label,
          type: item.kind,
          detail: item.detail,
          info: item.documentation,
          apply: item.insertText
        }))
      };
    } catch (error) {
      metricsCollector.record('python_completion_failed', 1, {
        category: MetricCategory.SYSTEM
      });
      return null;
    } finally {
      performanceTracker.endOperation(operationId, {
        component: 'PythonEditorIntegration',
        operation: OperationType.CODE_COMPLETION
      });
    }
  }

  private async linterSource(view: any): Promise<Diagnostic[]> {
    const operationId = performanceTracker.startOperation({
      component: 'PythonEditorIntegration',
      operation: OperationType.CONTEXT_ANALYSIS
    });

    try {
      const doc = view.state.doc;
      const diagnostics = await this.languageService.getDiagnostics(doc.toString());

      metricsCollector.record('python_diagnostics_provided', diagnostics.length, {
        category: MetricCategory.SYSTEM
      });

      return diagnostics.map(d => ({
        from: doc.line(d.line + 1).from + d.column,
        to: doc.line(d.line + 1).from + d.column,
        severity: d.severity,
        message: d.message
      }));
    } catch (error) {
      metricsCollector.record('python_diagnostics_failed', 1, {
        category: MetricCategory.SYSTEM
      });
      return [];
    } finally {
      performanceTracker.endOperation(operationId, {
        component: 'PythonEditorIntegration',
        operation: OperationType.CONTEXT_ANALYSIS
      });
    }
  }

  private initializeMetrics(): void {
    metricsCollector.registerMetric({
      name: 'python_editor_integration_initialized',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of successful editor integration initializations'
    });

    metricsCollector.registerMetric({
      name: 'python_editor_integration_initialization_failed',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of failed editor integration initializations'
    });

    metricsCollector.registerMetric({
      name: 'python_completion_items_provided',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of completion items provided to editor'
    });

    metricsCollector.registerMetric({
      name: 'python_completion_failed',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of failed completion requests in editor'
    });

    metricsCollector.registerMetric({
      name: 'python_diagnostics_provided',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of diagnostic items provided to editor'
    });

    metricsCollector.registerMetric({
      name: 'python_diagnostics_failed',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of failed diagnostic requests in editor'
    });
  }
}

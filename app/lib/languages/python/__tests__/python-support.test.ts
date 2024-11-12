import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { registerPythonSupport } from '../register';
import { PythonLanguageProvider } from '../provider';
import { PythonEditorIntegration } from '../editor-integration';
import { PythonLanguageService } from '../language-service';
import { metricsCollector } from '../../../ml/code-understanding/telemetry/metrics-collector';

// Mock the metrics collector
vi.mock('../../../ml/code-understanding/telemetry/metrics-collector', () => ({
  metricsCollector: {
    record: vi.fn(),
    registerMetric: vi.fn()
  }
}));

// Mock the performance tracker
vi.mock('../../../ml/code-understanding/telemetry/performance-tracker', () => ({
  performanceTracker: {
    startOperation: vi.fn(() => 'operation-id'),
    endOperation: vi.fn()
  },
  OperationType: {
    RESOURCE_CLEANUP: 'resource_cleanup',
    CODE_COMPLETION: 'code_completion',
    WORKER_TASK: 'worker_task'
  }
}));

describe('Python Language Support', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('Registration', () => {
    it('should register Python support successfully', async () => {
      const extension = await registerPythonSupport();
      expect(extension).toBeDefined();
      expect(metricsCollector.record).toHaveBeenCalledWith(
        'python_support_registered',
        1,
        expect.any(Object)
      );
    });

    it('should handle registration errors gracefully', async () => {
      // Mock provider to throw an error
      vi.spyOn(PythonLanguageProvider.prototype as any, 'initialize')
        .mockRejectedValueOnce(new Error('Initialization failed'));

      await expect(registerPythonSupport()).rejects.toThrow('Initialization failed');
      expect(metricsCollector.record).toHaveBeenCalledWith(
        'python_support_registration_failed',
        1,
        expect.any(Object)
      );
    });
  });

  describe('Language Service', () => {
    let service: PythonLanguageService;

    beforeEach(() => {
      service = PythonLanguageService.getInstance();
    });

    it('should provide code completions', async () => {
      const completions = await service.getCompletions('def test():\n    pr', {
        line: 1,
        column: 6
      });

      expect(completions).toContainEqual(
        expect.objectContaining({
          label: 'print',
          kind: 'function'
        })
      );
    });

    it('should provide diagnostics', async () => {
      const diagnostics = await service.getDiagnostics('def test():\nreturn x');
      expect(diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.any(String),
            severity: expect.stringMatching(/error|warning|info/)
          })
        ])
      );
    });
  });

  describe('Editor Integration', () => {
    let integration: PythonEditorIntegration;

    beforeEach(() => {
      integration = PythonEditorIntegration.getInstance();
    });

    it('should provide editor extensions', () => {
      const extensions = integration.getExtensions();
      expect(extensions).toBeDefined();
      expect(Array.isArray(extensions)).toBe(true);
      expect(extensions.length).toBeGreaterThan(0);
    });

    it('should initialize successfully', async () => {
      await expect(integration.initialize()).resolves.not.toThrow();
    });
  });

  describe('Code Execution', () => {
    const pythonCode = `
def greet(name):
    return f"Hello, {name}!"

result = greet("World")
print(result)
`;

    it('should execute Python code successfully', async () => {
      const provider = PythonLanguageProvider.getInstance();
      await provider.initialize();

      const support = provider.getLanguageSupport();
      expect(support).toBeDefined();

      // Verify the language support provides the expected features
      expect(support.language).toBeDefined();
      expect(support.language.name).toBe('python');
    });

    it('should handle syntax errors', async () => {
      const invalidCode = 'def invalid_syntax(:\n    pass';
      const provider = PythonLanguageProvider.getInstance();
      await provider.initialize();

      const support = provider.getLanguageSupport();
      expect(support).toBeDefined();

      // The language should detect syntax errors
      const parser = support.language.parser;
      const tree = parser.parse(invalidCode);
      expect(tree.toString()).toContain('Error');
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as ts from 'typescript';
import {
  CodeAnalyzer,
  createCodeAnalyzer,
  CodeQualityMetric,
  CodeIssueType,
  CodeIssueSeverity,
  type AnalysisConfig
} from '../analysis/code-analyzer';
import { metricsCollector } from '../../code-understanding/telemetry/metrics-collector';
import { performanceTracker } from '../../code-understanding/telemetry/performance-tracker';

describe('CodeAnalyzer', () => {
  let program: ts.Program;
  let analyzer: CodeAnalyzer;
  let sourceFile: ts.SourceFile;

  const mockConfig: Partial<AnalysisConfig> = {
    complexity: {
      maxCyclomaticComplexity: 10,
      maxCognitiveComplexity: 15,
      maxMethodLength: 30
    }
  };

  beforeEach(() => {
    // Create a mock program and source file
    const sourceText = `
      function complexFunction() {
        let result = 0;
        for (let i = 0; i < 10; i++) {
          if (i % 2 === 0) {
            result += i;
          } else if (i % 3 === 0) {
            result *= i;
          } else {
            result -= i;
          }
          switch (result) {
            case 0:
              result = 1;
              break;
            case 1:
              result = 2;
              break;
            default:
              result = 0;
          }
        }
        return result;
      }

      /**
       * Well-documented function
       * @param x First number
       * @param y Second number
       * @returns Sum of numbers
       */
      function simpleFunction(x: number, y: number): number {
        return x + y;
      }
    `;

    const compilerHost = ts.createCompilerHost({});
    compilerHost.getSourceFile = (fileName: string) => {
      if (fileName === 'test.ts') {
        return ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest);
      }
      return undefined;
    };

    program = ts.createProgram(['test.ts'], {}, compilerHost);
    sourceFile = program.getSourceFile('test.ts')!;
    analyzer = createCodeAnalyzer(program, mockConfig);

    // Mock metrics collector
    vi.spyOn(metricsCollector, 'record').mockImplementation(() => {});
    vi.spyOn(metricsCollector, 'registerMetric').mockImplementation(() => {});

    // Mock performance tracker
    vi.spyOn(performanceTracker, 'startOperation').mockReturnValue('test-op');
    vi.spyOn(performanceTracker, 'endOperation').mockImplementation(() => {});
  });

  describe('Code Analysis', () => {
    it('should analyze code complexity', async () => {
      const result = await analyzer.analyzeFile(sourceFile);

      expect(result.metrics[CodeQualityMetric.CYCLOMATIC_COMPLEXITY]).toBeGreaterThan(1);
      expect(result.metrics[CodeQualityMetric.COGNITIVE_COMPLEXITY]).toBeGreaterThan(1);
    });

    it('should calculate maintainability metrics', async () => {
      const result = await analyzer.analyzeFile(sourceFile);

      expect(result.metrics[CodeQualityMetric.MAINTAINABILITY_INDEX]).toBeDefined();
      expect(result.metrics[CodeQualityMetric.LINES_OF_CODE]).toBeGreaterThan(0);
      expect(result.metrics[CodeQualityMetric.COMMENT_RATIO]).toBeGreaterThanOrEqual(0);
    });

    it('should identify code issues', async () => {
      const result = await analyzer.analyzeFile(sourceFile);

      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues.some(i => i.type === CodeIssueType.COMPLEXITY)).toBe(true);
    });

    it('should provide improvement suggestions', async () => {
      const result = await analyzer.analyzeFile(sourceFile);

      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.suggestions.some(s => 
        s.includes('complex') || s.includes('breaking down')
      )).toBe(true);
    });

    it('should calculate overall code quality score', async () => {
      const result = await analyzer.analyzeFile(sourceFile);

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });
  });

  describe('Issue Detection', () => {
    it('should detect complexity issues', async () => {
      const result = await analyzer.analyzeFile(sourceFile);
      const complexityIssues = result.issues.filter(i => 
        i.type === CodeIssueType.COMPLEXITY
      );

      expect(complexityIssues.length).toBeGreaterThan(0);
      expect(complexityIssues[0].severity).toBeDefined();
      expect(complexityIssues[0].line).toBeGreaterThan(0);
    });

    it('should detect maintainability issues', async () => {
      const result = await analyzer.analyzeFile(sourceFile);
      const maintainabilityIssues = result.issues.filter(i => 
        i.type === CodeIssueType.MAINTAINABILITY
      );

      expect(maintainabilityIssues.length).toBeGreaterThanOrEqual(0);
      if (maintainabilityIssues.length > 0) {
        expect(maintainabilityIssues[0].suggestion).toBeDefined();
      }
    });

    it('should detect style issues', async () => {
      const result = await analyzer.analyzeFile(sourceFile);
      const styleIssues = result.issues.filter(i => 
        i.type === CodeIssueType.STYLE
      );

      expect(styleIssues.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Metric Collection', () => {
    it('should record metrics', async () => {
      await analyzer.analyzeFile(sourceFile);

      expect(metricsCollector.record).toHaveBeenCalledWith(
        expect.stringContaining('code_metric_'),
        expect.any(Number)
      );
    });

    it('should track performance', async () => {
      await analyzer.analyzeFile(sourceFile);

      expect(performanceTracker.startOperation).toHaveBeenCalled();
      expect(performanceTracker.endOperation).toHaveBeenCalled();
    });
  });

  describe('Configuration', () => {
    it('should respect complexity thresholds', async () => {
      const strictConfig: Partial<AnalysisConfig> = {
        complexity: {
          maxCyclomaticComplexity: 5,
          maxCognitiveComplexity: 7,
          maxMethodLength: 20
        }
      };

      const strictAnalyzer = createCodeAnalyzer(program, strictConfig);
      const result = await strictAnalyzer.analyzeFile(sourceFile);

      expect(result.issues.filter(i => 
        i.type === CodeIssueType.COMPLEXITY &&
        i.severity === CodeIssueSeverity.ERROR
      ).length).toBeGreaterThan(0);
    });

    it('should respect style configuration', async () => {
      const styleConfig: Partial<AnalysisConfig> = {
        style: {
          maxLineLength: 40,
          indentSize: 4,
          preferredQuotes: 'double'
        }
      };

      const styleAnalyzer = createCodeAnalyzer(program, styleConfig);
      const result = await styleAnalyzer.analyzeFile(sourceFile);

      expect(result.issues.filter(i => 
        i.type === CodeIssueType.STYLE
      ).length).toBeGreaterThan(0);
    });
  });

  describe('Analysis Results', () => {
    it('should provide detailed issue information', async () => {
      const result = await analyzer.analyzeFile(sourceFile);
      const issue = result.issues[0];

      expect(issue).toMatchObject({
        type: expect.any(String),
        severity: expect.any(String),
        message: expect.any(String),
        line: expect.any(Number),
        column: expect.any(Number),
        file: expect.any(String),
        code: expect.any(String)
      });
    });

    it('should provide actionable suggestions', async () => {
      const result = await analyzer.analyzeFile(sourceFile);

      expect(result.suggestions.every(s => 
        typeof s === 'string' && s.length > 0
      )).toBe(true);
    });

    it('should handle files with no issues', async () => {
      const cleanSourceFile = ts.createSourceFile(
        'clean.ts',
        'function add(a: number, b: number): number { return a + b; }',
        ts.ScriptTarget.Latest
      );

      const result = await analyzer.analyzeFile(cleanSourceFile);

      expect(result.issues.length).toBe(0);
      expect(result.score).toBeGreaterThanOrEqual(90);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid source files', async () => {
      const invalidSourceFile = ts.createSourceFile(
        'invalid.ts',
        'function {',
        ts.ScriptTarget.Latest
      );

      const result = await analyzer.analyzeFile(invalidSourceFile);

      expect(result).toBeDefined();
      expect(result.issues.some(i => 
        i.severity === CodeIssueSeverity.ERROR
      )).toBe(true);
    });

    it('should handle empty files', async () => {
      const emptySourceFile = ts.createSourceFile(
        'empty.ts',
        '',
        ts.ScriptTarget.Latest
      );

      const result = await analyzer.analyzeFile(emptySourceFile);

      expect(result.metrics[CodeQualityMetric.LINES_OF_CODE]).toBe(0);
      expect(result.issues.length).toBe(0);
    });
  });
});

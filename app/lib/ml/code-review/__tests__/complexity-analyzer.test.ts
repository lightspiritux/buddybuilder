import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as ts from 'typescript';
import {
  ComplexityAnalyzer,
  createComplexityAnalyzer,
  type ComplexityMetrics,
  type ComplexityRange
} from '../analysis/complexity-analyzer';
import { metricsCollector } from '../../code-understanding/telemetry/metrics-collector';
import { performanceTracker } from '../../code-understanding/telemetry/performance-tracker';

describe('ComplexityAnalyzer', () => {
  let analyzer: ComplexityAnalyzer;

  beforeEach(() => {
    // Mock metrics collector
    vi.spyOn(metricsCollector, 'record').mockImplementation(() => {});
    vi.spyOn(metricsCollector, 'registerMetric').mockImplementation(() => {});

    // Mock performance tracker
    vi.spyOn(performanceTracker, 'startOperation').mockReturnValue('test-op');
    vi.spyOn(performanceTracker, 'endOperation').mockImplementation(() => {});

    analyzer = createComplexityAnalyzer();
  });

  describe('Cyclomatic Complexity', () => {
    it('should calculate basic cyclomatic complexity', async () => {
      const sourceFile = ts.createSourceFile(
        'test.ts',
        'function test() { return true; }',
        ts.ScriptTarget.Latest
      );

      const metrics = await analyzer.analyzeComplexity(sourceFile);
      expect(metrics.cyclomaticComplexity).toBe(1);
    });

    it('should handle conditional statements', async () => {
      const sourceFile = ts.createSourceFile(
        'test.ts',
        `
        function test(x: number) {
          if (x > 0) {
            return 1;
          } else if (x < 0) {
            return -1;
          }
          return 0;
        }
        `,
        ts.ScriptTarget.Latest
      );

      const metrics = await analyzer.analyzeComplexity(sourceFile);
      expect(metrics.cyclomaticComplexity).toBeGreaterThan(1);
    });

    it('should handle loops', async () => {
      const sourceFile = ts.createSourceFile(
        'test.ts',
        `
        function test() {
          for (let i = 0; i < 10; i++) {
            while (true) {
              break;
            }
          }
        }
        `,
        ts.ScriptTarget.Latest
      );

      const metrics = await analyzer.analyzeComplexity(sourceFile);
      expect(metrics.cyclomaticComplexity).toBeGreaterThan(2);
    });
  });

  describe('Cognitive Complexity', () => {
    it('should calculate basic cognitive complexity', async () => {
      const sourceFile = ts.createSourceFile(
        'test.ts',
        'function test() { return true; }',
        ts.ScriptTarget.Latest
      );

      const metrics = await analyzer.analyzeComplexity(sourceFile);
      expect(metrics.cognitiveComplexity).toBe(0);
    });

    it('should handle nested conditions', async () => {
      const sourceFile = ts.createSourceFile(
        'test.ts',
        `
        function test(x: number, y: number) {
          if (x > 0) {
            if (y > 0) {
              return x + y;
            }
          }
          return 0;
        }
        `,
        ts.ScriptTarget.Latest
      );

      const metrics = await analyzer.analyzeComplexity(sourceFile);
      expect(metrics.cognitiveComplexity).toBeGreaterThan(2);
    });

    it('should handle complex logical expressions', async () => {
      const sourceFile = ts.createSourceFile(
        'test.ts',
        `
        function test(x: number, y: number) {
          return x > 0 && y > 0 || x < 0 && y < 0;
        }
        `,
        ts.ScriptTarget.Latest
      );

      const metrics = await analyzer.analyzeComplexity(sourceFile);
      expect(metrics.cognitiveComplexity).toBeGreaterThan(0);
    });
  });

  describe('Halstead Metrics', () => {
    it('should calculate basic Halstead metrics', async () => {
      const sourceFile = ts.createSourceFile(
        'test.ts',
        'const x = a + b;',
        ts.ScriptTarget.Latest
      );

      const metrics = await analyzer.analyzeComplexity(sourceFile);
      expect(metrics.halsteadComplexity.operators.total).toBeGreaterThan(0);
      expect(metrics.halsteadComplexity.operands.total).toBeGreaterThan(0);
    });

    it('should handle different types of operators', async () => {
      const sourceFile = ts.createSourceFile(
        'test.ts',
        `
        const a = 1;
        const b = 2;
        const c = a + b;
        const d = c * b;
        const e = -d;
        `,
        ts.ScriptTarget.Latest
      );

      const metrics = await analyzer.analyzeComplexity(sourceFile);
      expect(metrics.halsteadComplexity.operators.unique).toBeGreaterThan(2);
    });

    it('should calculate volume and effort', async () => {
      const sourceFile = ts.createSourceFile(
        'test.ts',
        `
        function calculate(x: number, y: number): number {
          return x * y + Math.pow(x, 2);
        }
        `,
        ts.ScriptTarget.Latest
      );

      const metrics = await analyzer.analyzeComplexity(sourceFile);
      expect(metrics.halsteadComplexity.volume).toBeGreaterThan(0);
      expect(metrics.halsteadComplexity.effort).toBeGreaterThan(0);
    });
  });

  describe('Maintainability Index', () => {
    it('should calculate maintainability index', async () => {
      const sourceFile = ts.createSourceFile(
        'test.ts',
        `
        function test() {
          let sum = 0;
          for (let i = 0; i < 10; i++) {
            sum += i;
          }
          return sum;
        }
        `,
        ts.ScriptTarget.Latest
      );

      const metrics = await analyzer.analyzeComplexity(sourceFile);
      expect(metrics.maintainabilityIndex).toBeGreaterThanOrEqual(0);
      expect(metrics.maintainabilityIndex).toBeLessThanOrEqual(100);
    });

    it('should handle empty files', async () => {
      const sourceFile = ts.createSourceFile(
        'test.ts',
        '',
        ts.ScriptTarget.Latest
      );

      const metrics = await analyzer.analyzeComplexity(sourceFile);
      expect(metrics.maintainabilityIndex).toBe(100);
    });
  });

  describe('Control Flow Complexity', () => {
    it('should calculate control flow complexity', async () => {
      const sourceFile = ts.createSourceFile(
        'test.ts',
        `
        function test(x: number) {
          if (x > 0) {
            for (let i = 0; i < x; i++) {
              if (i % 2 === 0) {
                console.log(i);
              }
            }
          }
        }
        `,
        ts.ScriptTarget.Latest
      );

      const metrics = await analyzer.analyzeComplexity(sourceFile);
      expect(metrics.controlFlowComplexity).toBeGreaterThan(3);
    });

    it('should handle switch statements', async () => {
      const sourceFile = ts.createSourceFile(
        'test.ts',
        `
        function test(x: number) {
          switch (x) {
            case 1:
              return 'one';
            case 2:
              return 'two';
            default:
              return 'other';
          }
        }
        `,
        ts.ScriptTarget.Latest
      );

      const metrics = await analyzer.analyzeComplexity(sourceFile);
      expect(metrics.controlFlowComplexity).toBeGreaterThan(0);
    });
  });

  describe('Metric Collection', () => {
    it('should record metrics', async () => {
      const sourceFile = ts.createSourceFile(
        'test.ts',
        'function test() { return true; }',
        ts.ScriptTarget.Latest
      );

      await analyzer.analyzeComplexity(sourceFile);

      expect(metricsCollector.record).toHaveBeenCalledWith(
        'complexity_cyclomatic',
        expect.any(Number)
      );
      expect(metricsCollector.record).toHaveBeenCalledWith(
        'complexity_cognitive',
        expect.any(Number)
      );
    });

    it('should track performance', async () => {
      const sourceFile = ts.createSourceFile(
        'test.ts',
        'function test() { return true; }',
        ts.ScriptTarget.Latest
      );

      await analyzer.analyzeComplexity(sourceFile);

      expect(performanceTracker.startOperation).toHaveBeenCalled();
      expect(performanceTracker.endOperation).toHaveBeenCalled();
    });
  });

  describe('Configuration', () => {
    it('should respect custom ranges', async () => {
      const customRanges: Partial<Record<keyof ComplexityMetrics, ComplexityRange>> = {
        cyclomaticComplexity: {
          low: 5,
          medium: 10,
          high: 15,
          veryHigh: 20
        }
      };

      const customAnalyzer = createComplexityAnalyzer(customRanges);
      const sourceFile = ts.createSourceFile(
        'test.ts',
        `
        function test(x: number) {
          if (x > 0) return 1;
          if (x < 0) return -1;
          return 0;
        }
        `,
        ts.ScriptTarget.Latest
      );

      const metrics = await customAnalyzer.analyzeComplexity(sourceFile);
      expect(metrics.cyclomaticComplexity).toBeGreaterThan(1);
    });
  });
});

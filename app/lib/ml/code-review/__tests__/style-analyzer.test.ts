import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as ts from 'typescript';
import {
  StyleAnalyzer,
  createStyleAnalyzer,
  type StyleConfig,
  type StyleRule
} from '../analysis/style-analyzer';
import { metricsCollector } from '../../code-understanding/telemetry/metrics-collector';
import { performanceTracker } from '../../code-understanding/telemetry/performance-tracker';
import type { CodeIssueSeverity } from '../analysis/code-analyzer';

describe('StyleAnalyzer', () => {
  let analyzer: StyleAnalyzer;
  let program: ts.Program;

  beforeEach(() => {
    // Mock metrics collector
    vi.spyOn(metricsCollector, 'record').mockImplementation(() => {});
    vi.spyOn(metricsCollector, 'registerMetric').mockImplementation(() => {});

    // Mock performance tracker
    vi.spyOn(performanceTracker, 'startOperation').mockReturnValue('test-op');
    vi.spyOn(performanceTracker, 'endOperation').mockImplementation(() => {});

    // Create program with compiler host
    const compilerHost = ts.createCompilerHost({});
    program = ts.createProgram([], {}, compilerHost);

    analyzer = createStyleAnalyzer();
  });

  describe('Style Rules', () => {
    it('should check indentation', async () => {
      const sourceFile = ts.createSourceFile(
        'test.ts',
        `
function test() {
   return true;
}`,
        ts.ScriptTarget.Latest
      );

      const issues = await analyzer.analyzeStyle(sourceFile, program);
      const indentationIssues = issues.filter(i => i.code === 'indentation');

      expect(indentationIssues.length).toBeGreaterThan(0);
      expect(indentationIssues[0].message).toContain('indentation');
    });

    it('should check line length', async () => {
      const sourceFile = ts.createSourceFile(
        'test.ts',
        'const veryLongVariableName = "This is a very long string that definitely exceeds the maximum line length limit set in the configuration";',
        ts.ScriptTarget.Latest
      );

      const issues = await analyzer.analyzeStyle(sourceFile, program);
      const lineLengthIssues = issues.filter(i => i.code === 'line-length');

      expect(lineLengthIssues.length).toBeGreaterThan(0);
      expect(lineLengthIssues[0].message).toContain('maximum length');
    });

    it('should check naming conventions', async () => {
      const sourceFile = ts.createSourceFile(
        'test.ts',
        `
class invalidClassName {}
interface invalidInterfaceName {}
const INVALID_constant = 42;
`,
        ts.ScriptTarget.Latest
      );

      const issues = await analyzer.analyzeStyle(sourceFile, program);
      const namingIssues = issues.filter(i => i.code === 'naming-convention');

      expect(namingIssues.length).toBeGreaterThan(0);
      expect(namingIssues.some(i => i.message.includes('class'))).toBe(true);
      expect(namingIssues.some(i => i.message.includes('interface'))).toBe(true);
      expect(namingIssues.some(i => i.message.includes('constant'))).toBe(true);
    });

    it('should check import organization', async () => {
      const sourceFile = ts.createSourceFile(
        'test.ts',
        `
import { something } from './local';
import { another } from 'external';
import * as fs from 'fs';
`,
        ts.ScriptTarget.Latest
      );

      const issues = await analyzer.analyzeStyle(sourceFile, program);
      const importIssues = issues.filter(i => i.code === 'import-organization');

      expect(importIssues.length).toBeGreaterThan(0);
      expect(importIssues[0].message).toContain('import');
    });

    it('should check JSDoc comments', async () => {
      const sourceFile = ts.createSourceFile(
        'test.ts',
        `
function add(a: number, b: number): number {
  return a + b;
}
`,
        ts.ScriptTarget.Latest
      );

      const issues = await analyzer.analyzeStyle(sourceFile, program);
      const jsDocIssues = issues.filter(i => i.code === 'jsdoc-comments');

      expect(jsDocIssues.length).toBeGreaterThan(0);
      expect(jsDocIssues[0].message).toContain('JSDoc');
    });
  });

  describe('Configuration', () => {
    it('should respect custom indentation settings', async () => {
      const customConfig: Partial<StyleConfig> = {
        indentation: {
          style: 'tab',
          size: 4
        }
      };

      const customAnalyzer = createStyleAnalyzer(customConfig);
      const sourceFile = ts.createSourceFile(
        'test.ts',
        `
function test() {
  return true;
}`,
        ts.ScriptTarget.Latest
      );

      const issues = await customAnalyzer.analyzeStyle(sourceFile, program);
      const indentationIssues = issues.filter(i => i.code === 'indentation');

      expect(indentationIssues.length).toBeGreaterThan(0);
      expect(indentationIssues[0].message).toContain('tab');
    });

    it('should respect custom line length settings', async () => {
      const customConfig: Partial<StyleConfig> = {
        lineLength: {
          max: 50,
          ignoreComments: false,
          ignoreUrls: false
        }
      };

      const customAnalyzer = createStyleAnalyzer(customConfig);
      const sourceFile = ts.createSourceFile(
        'test.ts',
        'const shortButStillTooLongForCustomConfig = "value";',
        ts.ScriptTarget.Latest
      );

      const issues = await customAnalyzer.analyzeStyle(sourceFile, program);
      const lineLengthIssues = issues.filter(i => i.code === 'line-length');

      expect(lineLengthIssues.length).toBeGreaterThan(0);
      expect(lineLengthIssues[0].message).toContain('50');
    });

    it('should respect custom naming conventions', async () => {
      const customConfig: Partial<StyleConfig> = {
        naming: {
          classes: 'camelCase',
          interfaces: 'camelCase',
          types: 'camelCase',
          methods: 'camelCase',
          properties: 'camelCase',
          variables: 'camelCase',
          constants: 'camelCase'
        }
      };

      const customAnalyzer = createStyleAnalyzer(customConfig);
      const sourceFile = ts.createSourceFile(
        'test.ts',
        'class TestClass {}',
        ts.ScriptTarget.Latest
      );

      const issues = await customAnalyzer.analyzeStyle(sourceFile, program);
      const namingIssues = issues.filter(i => i.code === 'naming-convention');

      expect(namingIssues.length).toBeGreaterThan(0);
      expect(namingIssues[0].message).toContain('camelCase');
    });
  });

  describe('Custom Rules', () => {
    it('should allow adding custom rules', async () => {
      const customRule: StyleRule = {
        id: 'custom-rule',
        name: 'Custom Rule',
        description: 'Custom style rule',
        severity: 'WARNING' as CodeIssueSeverity,
        check: (node) => {
          return [{
            rule: customRule,
            message: 'Custom rule violation',
            node
          }];
        }
      };

      analyzer.addRule(customRule);
      const sourceFile = ts.createSourceFile(
        'test.ts',
        'const x = 1;',
        ts.ScriptTarget.Latest
      );

      const issues = await analyzer.analyzeStyle(sourceFile, program);
      const customIssues = issues.filter(i => i.code === 'custom-rule');

      expect(customIssues.length).toBeGreaterThan(0);
      expect(customIssues[0].message).toBe('Custom rule violation');
    });
  });

  describe('Metrics', () => {
    it('should record style violations', async () => {
      const sourceFile = ts.createSourceFile(
        'test.ts',
        'const x = 1;',
        ts.ScriptTarget.Latest
      );

      await analyzer.analyzeStyle(sourceFile, program);

      expect(metricsCollector.record).toHaveBeenCalledWith(
        'style_violations_total',
        expect.any(Number)
      );
    });

    it('should track performance', async () => {
      const sourceFile = ts.createSourceFile(
        'test.ts',
        'const x = 1;',
        ts.ScriptTarget.Latest
      );

      await analyzer.analyzeStyle(sourceFile, program);

      expect(performanceTracker.startOperation).toHaveBeenCalled();
      expect(performanceTracker.endOperation).toHaveBeenCalled();
    });
  });

  describe('Auto-fix', () => {
    it('should provide auto-fix suggestions when available', async () => {
      const sourceFile = ts.createSourceFile(
        'test.ts',
        'const x=1;',
        ts.ScriptTarget.Latest
      );

      const issues = await analyzer.analyzeStyle(sourceFile, program);
      const fixableIssues = issues.filter(i => i.autoFix);

      expect(fixableIssues.length).toBeGreaterThan(0);
      expect(typeof fixableIssues[0].autoFix).toBe('function');
    });

    it('should handle auto-fix failures gracefully', async () => {
      const sourceFile = ts.createSourceFile(
        'test.ts',
        'const x=1;',
        ts.ScriptTarget.Latest
      );

      const issues = await analyzer.analyzeStyle(sourceFile, program);
      const fixableIssue = issues.find(i => i.autoFix);

      if (fixableIssue?.autoFix) {
        await expect(fixableIssue.autoFix()).resolves.not.toThrow();
      }
    });
  });
});

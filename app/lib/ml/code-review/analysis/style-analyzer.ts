/**
 * Style Analyzer
 * 
 * Analyzes code style and formatting:
 * 1. Code formatting rules
 * 2. Naming conventions
 * 3. File organization
 * 4. Import ordering
 * 5. Comment style
 */

import * as ts from 'typescript';
import { metricsCollector, MetricType, MetricCategory } from '../../code-understanding/telemetry/metrics-collector';
import { performanceTracker, OperationType } from '../../code-understanding/telemetry/performance-tracker';
import type { CodeIssue, CodeIssueType, CodeIssueSeverity } from './code-analyzer';

export interface StyleRule {
  id: string;
  name: string;
  description: string;
  severity: CodeIssueSeverity;
  check: (node: ts.Node, context: StyleContext) => StyleViolation[];
}

export interface StyleViolation {
  rule: StyleRule;
  message: string;
  node: ts.Node;
  fix?: () => ts.Node;
}

export interface StyleContext {
  sourceFile: ts.SourceFile;
  config: StyleConfig;
  checker: ts.TypeChecker;
}

export interface StyleConfig {
  indentation: {
    style: 'space' | 'tab';
    size: number;
  };
  lineLength: {
    max: number;
    ignoreComments: boolean;
    ignoreUrls: boolean;
  };
  naming: {
    classes: 'PascalCase' | 'camelCase';
    interfaces: 'PascalCase' | 'camelCase';
    types: 'PascalCase' | 'camelCase';
    methods: 'camelCase';
    properties: 'camelCase';
    variables: 'camelCase';
    constants: 'UPPER_CASE' | 'camelCase';
  };
  imports: {
    sortOrder: Array<'builtin' | 'external' | 'internal' | 'parent' | 'sibling'>;
    newlineBetweenGroups: boolean;
    maxLineLength: number;
    allowMultiline: boolean;
  };
  comments: {
    requireJsDoc: boolean;
    requireParams: boolean;
    requireReturns: boolean;
    requireDescription: boolean;
  };
}

export const DEFAULT_STYLE_CONFIG: StyleConfig = {
  indentation: {
    style: 'space',
    size: 2
  },
  lineLength: {
    max: 100,
    ignoreComments: true,
    ignoreUrls: true
  },
  naming: {
    classes: 'PascalCase',
    interfaces: 'PascalCase',
    types: 'PascalCase',
    methods: 'camelCase',
    properties: 'camelCase',
    variables: 'camelCase',
    constants: 'UPPER_CASE'
  },
  imports: {
    sortOrder: ['builtin', 'external', 'internal', 'parent', 'sibling'],
    newlineBetweenGroups: true,
    maxLineLength: 100,
    allowMultiline: true
  },
  comments: {
    requireJsDoc: true,
    requireParams: true,
    requireReturns: true,
    requireDescription: true
  }
};

export class StyleAnalyzer {
  private static instance: StyleAnalyzer;
  private config: StyleConfig;
  private rules: StyleRule[] = [];

  private constructor(config: Partial<StyleConfig> = {}) {
    this.config = { ...DEFAULT_STYLE_CONFIG, ...config };
    this.initializeRules();
    this.initializeMetrics();
  }

  static getInstance(config?: Partial<StyleConfig>): StyleAnalyzer {
    if (!StyleAnalyzer.instance) {
      StyleAnalyzer.instance = new StyleAnalyzer(config);
    }
    return StyleAnalyzer.instance;
  }

  /**
   * Analyze code style
   */
  async analyzeStyle(sourceFile: ts.SourceFile, program: ts.Program): Promise<CodeIssue[]> {
    const operationId = performanceTracker.startOperation({
      component: 'StyleAnalyzer',
      operation: OperationType.CODE_COMPLETION
    });

    try {
      const context: StyleContext = {
        sourceFile,
        config: this.config,
        checker: program.getTypeChecker()
      };

      const violations = this.findViolations(sourceFile, context);
      const issues = this.convertViolationsToIssues(violations);

      this.recordMetrics(violations);

      return issues;
    } finally {
      performanceTracker.endOperation(operationId, {
        component: 'StyleAnalyzer',
        operation: OperationType.CODE_COMPLETION
      });
    }
  }

  /**
   * Add custom style rule
   */
  addRule(rule: StyleRule): void {
    this.rules.push(rule);
  }

  private findViolations(node: ts.Node, context: StyleContext): StyleViolation[] {
    const violations: StyleViolation[] = [];

    // Check each rule
    this.rules.forEach(rule => {
      violations.push(...rule.check(node, context));
    });

    // Recursively check children
    node.forEachChild(child => {
      violations.push(...this.findViolations(child, context));
    });

    return violations;
  }

  private convertViolationsToIssues(violations: StyleViolation[]): CodeIssue[] {
    return violations.map(violation => ({
      type: 'style' as CodeIssueType,
      severity: violation.rule.severity,
      message: violation.message,
      line: violation.node.getSourceFile().getLineAndCharacterOfPosition(violation.node.getStart()).line + 1,
      column: violation.node.getSourceFile().getLineAndCharacterOfPosition(violation.node.getStart()).character + 1,
      file: violation.node.getSourceFile().fileName,
      code: violation.node.getText(),
      suggestion: violation.rule.description,
      autoFix: violation.fix ? async () => {
        const newNode = violation.fix!();
        // Implementation of auto-fix would go here
        return Promise.resolve();
      } : undefined
    }));
  }

  private initializeRules(): void {
    // Indentation rule
    this.addRule({
      id: 'indentation',
      name: 'Indentation',
      description: `Use ${this.config.indentation.size} ${this.config.indentation.style}s for indentation`,
      severity: 'warning' as CodeIssueSeverity,
      check: (node, context) => {
        // Implementation would check indentation
        return [];
      }
    });

    // Line length rule
    this.addRule({
      id: 'line-length',
      name: 'Line Length',
      description: `Lines should not exceed ${this.config.lineLength.max} characters`,
      severity: 'warning' as CodeIssueSeverity,
      check: (node, context) => {
        const violations: StyleViolation[] = [];
        const sourceFile = node.getSourceFile();
        const lines = sourceFile.getFullText().split('\n');

        lines.forEach((line, index) => {
          if (this.shouldCheckLineLength(line) && line.length > context.config.lineLength.max) {
            violations.push({
              rule: this.rules.find(r => r.id === 'line-length')!,
              message: `Line ${index + 1} exceeds maximum length of ${context.config.lineLength.max}`,
              node: sourceFile
            });
          }
        });

        return violations;
      }
    });

    // Naming convention rule
    this.addRule({
      id: 'naming-convention',
      name: 'Naming Convention',
      description: 'Follow naming conventions for different identifiers',
      severity: 'warning' as CodeIssueSeverity,
      check: (node, context) => {
        const violations: StyleViolation[] = [];

        if (ts.isClassDeclaration(node) && node.name) {
          if (!this.checkNamingConvention(node.name.text, this.config.naming.classes)) {
            violations.push({
              rule: this.rules.find(r => r.id === 'naming-convention')!,
              message: `Class name "${node.name.text}" should be in ${this.config.naming.classes}`,
              node
            });
          }
        }

        // Similar checks for other identifiers...

        return violations;
      }
    });

    // Import organization rule
    this.addRule({
      id: 'import-organization',
      name: 'Import Organization',
      description: 'Organize imports according to configuration',
      severity: 'warning' as CodeIssueSeverity,
      check: (node, context) => {
        // Implementation would check import organization
        return [];
      }
    });

    // JSDoc comment rule
    this.addRule({
      id: 'jsdoc-comments',
      name: 'JSDoc Comments',
      description: 'Ensure proper JSDoc comments',
      severity: 'warning' as CodeIssueSeverity,
      check: (node, context) => {
        // Implementation would check JSDoc comments
        return [];
      }
    });
  }

  private shouldCheckLineLength(line: string): boolean {
    if (this.config.lineLength.ignoreComments && (line.trim().startsWith('//') || line.trim().startsWith('/*'))) {
      return false;
    }

    if (this.config.lineLength.ignoreUrls && /https?:\/\/[^\s]+/.test(line)) {
      return false;
    }

    return true;
  }

  private checkNamingConvention(name: string, convention: string): boolean {
    switch (convention) {
      case 'PascalCase':
        return /^[A-Z][a-zA-Z0-9]*$/.test(name);
      case 'camelCase':
        return /^[a-z][a-zA-Z0-9]*$/.test(name);
      case 'UPPER_CASE':
        return /^[A-Z][A-Z0-9_]*$/.test(name);
      default:
        return true;
    }
  }

  private recordMetrics(violations: StyleViolation[]): void {
    metricsCollector.record('style_violations_total', violations.length);

    const severityCounts = violations.reduce((acc, v) => {
      const severity = v.rule.severity as string;
      acc[severity] = (acc[severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    Object.entries(severityCounts).forEach(([severity, count]) => {
      metricsCollector.record(`style_violations_${severity.toLowerCase()}`, count);
    });
  }

  private initializeMetrics(): void {
    metricsCollector.registerMetric({
      name: 'style_violations_total',
      type: MetricType.GAUGE,
      category: MetricCategory.SYSTEM,
      description: 'Total number of style violations'
    });

    ['info', 'warning', 'error'].forEach(severity => {
      metricsCollector.registerMetric({
        name: `style_violations_${severity}`,
        type: MetricType.GAUGE,
        category: MetricCategory.SYSTEM,
        description: `Number of ${severity} style violations`
      });
    });
  }
}

// Export factory function
export function createStyleAnalyzer(config?: Partial<StyleConfig>): StyleAnalyzer {
  return StyleAnalyzer.getInstance(config);
}

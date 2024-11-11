/**
 * Code Complexity Analyzer
 * 
 * Analyzes code complexity metrics:
 * 1. Cyclomatic complexity
 * 2. Cognitive complexity
 * 3. Halstead complexity
 * 4. Maintainability index
 * 5. Control flow complexity
 */

import * as ts from 'typescript';
import { metricsCollector, MetricType, MetricCategory } from '../../code-understanding/telemetry/metrics-collector';
import { performanceTracker, OperationType } from '../../code-understanding/telemetry/performance-tracker';

export interface ComplexityMetrics {
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
  halsteadComplexity: HalsteadMetrics;
  maintainabilityIndex: number;
  controlFlowComplexity: number;
}

export interface HalsteadMetrics {
  operators: {
    unique: number;
    total: number;
  };
  operands: {
    unique: number;
    total: number;
  };
  vocabulary: number;
  length: number;
  volume: number;
  difficulty: number;
  effort: number;
  time: number;
  bugs: number;
}

export interface ComplexityRange {
  low: number;
  medium: number;
  high: number;
  veryHigh: number;
}

export const DEFAULT_COMPLEXITY_RANGES: Record<keyof ComplexityMetrics, ComplexityRange> = {
  cyclomaticComplexity: {
    low: 10,
    medium: 20,
    high: 30,
    veryHigh: 40
  },
  cognitiveComplexity: {
    low: 8,
    medium: 15,
    high: 25,
    veryHigh: 35
  },
  halsteadComplexity: {
    low: 20,
    medium: 30,
    high: 40,
    veryHigh: 50
  },
  maintainabilityIndex: {
    low: 85,
    medium: 65,
    high: 45,
    veryHigh: 25
  },
  controlFlowComplexity: {
    low: 5,
    medium: 10,
    high: 15,
    veryHigh: 20
  }
};

export class ComplexityAnalyzer {
  private static instance: ComplexityAnalyzer;
  private ranges: Record<keyof ComplexityMetrics, ComplexityRange>;

  private constructor(ranges?: Partial<Record<keyof ComplexityMetrics, ComplexityRange>>) {
    this.ranges = { ...DEFAULT_COMPLEXITY_RANGES, ...ranges };
    this.initializeMetrics();
  }

  static getInstance(ranges?: Partial<Record<keyof ComplexityMetrics, ComplexityRange>>): ComplexityAnalyzer {
    if (!ComplexityAnalyzer.instance) {
      ComplexityAnalyzer.instance = new ComplexityAnalyzer(ranges);
    }
    return ComplexityAnalyzer.instance;
  }

  /**
   * Analyze code complexity
   */
  async analyzeComplexity(node: ts.Node): Promise<ComplexityMetrics> {
    const operationId = performanceTracker.startOperation({
      component: 'ComplexityAnalyzer',
      operation: OperationType.CODE_COMPLETION
    });

    try {
      const cyclomaticComplexity = this.calculateCyclomaticComplexity(node);
      const cognitiveComplexity = this.calculateCognitiveComplexity(node);
      const halsteadComplexity = this.calculateHalsteadMetrics(node);
      const maintainabilityIndex = this.calculateMaintainabilityIndex(
        cyclomaticComplexity,
        halsteadComplexity,
        this.countLines(node)
      );
      const controlFlowComplexity = this.calculateControlFlowComplexity(node);

      const metrics: ComplexityMetrics = {
        cyclomaticComplexity,
        cognitiveComplexity,
        halsteadComplexity,
        maintainabilityIndex,
        controlFlowComplexity
      };

      this.recordMetrics(metrics);

      return metrics;
    } finally {
      performanceTracker.endOperation(operationId, {
        component: 'ComplexityAnalyzer',
        operation: OperationType.CODE_COMPLETION
      });
    }
  }

  /**
   * Calculate cyclomatic complexity
   */
  private calculateCyclomaticComplexity(node: ts.Node): number {
    let complexity = 1; // Base complexity

    const incrementComplexity = () => complexity++;

    const visit = (node: ts.Node) => {
      switch (node.kind) {
        case ts.SyntaxKind.IfStatement:
        case ts.SyntaxKind.WhileStatement:
        case ts.SyntaxKind.DoStatement:
        case ts.SyntaxKind.ForStatement:
        case ts.SyntaxKind.ForInStatement:
        case ts.SyntaxKind.ForOfStatement:
        case ts.SyntaxKind.ConditionalExpression:
          incrementComplexity();
          break;
        case ts.SyntaxKind.CaseClause:
        case ts.SyntaxKind.CatchClause:
          incrementComplexity();
          break;
        case ts.SyntaxKind.BinaryExpression:
          const binaryExpr = node as ts.BinaryExpression;
          if (
            binaryExpr.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
            binaryExpr.operatorToken.kind === ts.SyntaxKind.BarBarToken
          ) {
            incrementComplexity();
          }
          break;
      }

      ts.forEachChild(node, visit);
    };

    visit(node);
    return complexity;
  }

  /**
   * Calculate cognitive complexity
   */
  private calculateCognitiveComplexity(node: ts.Node): number {
    let complexity = 0;
    let nesting = 0;

    const visit = (node: ts.Node, nested: boolean = false) => {
      const increment = (amount: number) => {
        complexity += amount + nesting;
      };

      switch (node.kind) {
        case ts.SyntaxKind.IfStatement:
          increment(1);
          if (nested) nesting++;
          break;
        case ts.SyntaxKind.WhileStatement:
        case ts.SyntaxKind.DoStatement:
        case ts.SyntaxKind.ForStatement:
        case ts.SyntaxKind.ForInStatement:
        case ts.SyntaxKind.ForOfStatement:
          increment(1);
          if (nested) nesting++;
          break;
        case ts.SyntaxKind.CatchClause:
          increment(1);
          break;
        case ts.SyntaxKind.ConditionalExpression:
          increment(1);
          break;
        case ts.SyntaxKind.BinaryExpression:
          const binaryExpr = node as ts.BinaryExpression;
          if (
            binaryExpr.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
            binaryExpr.operatorToken.kind === ts.SyntaxKind.BarBarToken
          ) {
            increment(1);
          }
          break;
        case ts.SyntaxKind.SwitchStatement:
          increment(1);
          if (nested) nesting++;
          break;
      }

      ts.forEachChild(node, n => visit(n, true));

      if (nested) nesting--;
    };

    visit(node);
    return complexity;
  }

  /**
   * Calculate Halstead metrics
   */
  private calculateHalsteadMetrics(node: ts.Node): HalsteadMetrics {
    const operators = new Set<string>();
    const operands = new Set<string>();
    let totalOperators = 0;
    let totalOperands = 0;

    const visit = (node: ts.Node) => {
      if (ts.isBinaryExpression(node)) {
        operators.add(node.operatorToken.getText());
        totalOperators++;
      } else if (ts.isPrefixUnaryExpression(node)) {
        operators.add(node.operator.toString());
        totalOperators++;
      } else if (ts.isPostfixUnaryExpression(node)) {
        operators.add(node.operator.toString());
        totalOperators++;
      } else if (ts.isIdentifier(node)) {
        operands.add(node.text);
        totalOperands++;
      } else if (ts.isNumericLiteral(node) || ts.isStringLiteral(node)) {
        operands.add(node.text);
        totalOperands++;
      }

      ts.forEachChild(node, visit);
    };

    visit(node);

    const n1 = operators.size;
    const n2 = operands.size;
    const N1 = totalOperators;
    const N2 = totalOperands;

    const vocabulary = n1 + n2;
    const length = N1 + N2;
    const volume = length * Math.log2(Math.max(1, vocabulary));
    const difficulty = n2 === 0 ? 0 : (n1 / 2) * (N2 / n2);
    const effort = difficulty * volume;
    const time = effort / 18;
    const bugs = volume / 3000;

    return {
      operators: {
        unique: n1,
        total: N1
      },
      operands: {
        unique: n2,
        total: N2
      },
      vocabulary,
      length,
      volume,
      difficulty,
      effort,
      time,
      bugs
    };
  }

  /**
   * Calculate maintainability index
   */
  private calculateMaintainabilityIndex(
    cyclomaticComplexity: number,
    halstead: HalsteadMetrics,
    linesOfCode: number
  ): number {
    const HV = halstead.volume;
    const CC = cyclomaticComplexity;
    const LOC = Math.max(1, linesOfCode);

    // Original formula: 171 - 5.2 * ln(HV) - 0.23 * CC - 16.2 * ln(LOC)
    // Normalized to 0-100 scale
    let mi = Math.max(0, (171 - 5.2 * Math.log(Math.max(1, HV)) - 0.23 * CC - 16.2 * Math.log(LOC)) * 100 / 171);
    return Math.min(100, mi);
  }

  /**
   * Calculate control flow complexity
   */
  private calculateControlFlowComplexity(node: ts.Node): number {
    let complexity = 0;
    let nesting = 0;

    const visit = (node: ts.Node) => {
      switch (node.kind) {
        case ts.SyntaxKind.IfStatement:
        case ts.SyntaxKind.WhileStatement:
        case ts.SyntaxKind.DoStatement:
        case ts.SyntaxKind.ForStatement:
        case ts.SyntaxKind.ForInStatement:
        case ts.SyntaxKind.ForOfStatement:
        case ts.SyntaxKind.SwitchStatement:
          complexity += Math.pow(2, nesting);
          nesting++;
          break;
      }

      ts.forEachChild(node, visit);
      
      if (
        node.kind === ts.SyntaxKind.IfStatement ||
        node.kind === ts.SyntaxKind.WhileStatement ||
        node.kind === ts.SyntaxKind.DoStatement ||
        node.kind === ts.SyntaxKind.ForStatement ||
        node.kind === ts.SyntaxKind.ForInStatement ||
        node.kind === ts.SyntaxKind.ForOfStatement ||
        node.kind === ts.SyntaxKind.SwitchStatement
      ) {
        nesting--;
      }
    };

    visit(node);
    return complexity;
  }

  /**
   * Count lines of code
   */
  private countLines(node: ts.Node): number {
    const text = node.getFullText();
    return text.split('\n').length;
  }

  /**
   * Record complexity metrics
   */
  private recordMetrics(metrics: ComplexityMetrics): void {
    metricsCollector.record('complexity_cyclomatic', metrics.cyclomaticComplexity);
    metricsCollector.record('complexity_cognitive', metrics.cognitiveComplexity);
    metricsCollector.record('complexity_halstead_volume', metrics.halsteadComplexity.volume);
    metricsCollector.record('complexity_maintainability', metrics.maintainabilityIndex);
    metricsCollector.record('complexity_control_flow', metrics.controlFlowComplexity);
  }

  /**
   * Initialize metrics
   */
  private initializeMetrics(): void {
    metricsCollector.registerMetric({
      name: 'complexity_cyclomatic',
      type: MetricType.GAUGE,
      category: MetricCategory.SYSTEM,
      description: 'Cyclomatic complexity'
    });

    metricsCollector.registerMetric({
      name: 'complexity_cognitive',
      type: MetricType.GAUGE,
      category: MetricCategory.SYSTEM,
      description: 'Cognitive complexity'
    });

    metricsCollector.registerMetric({
      name: 'complexity_halstead_volume',
      type: MetricType.GAUGE,
      category: MetricCategory.SYSTEM,
      description: 'Halstead complexity volume'
    });

    metricsCollector.registerMetric({
      name: 'complexity_maintainability',
      type: MetricType.GAUGE,
      category: MetricCategory.SYSTEM,
      description: 'Maintainability index'
    });

    metricsCollector.registerMetric({
      name: 'complexity_control_flow',
      type: MetricType.GAUGE,
      category: MetricCategory.SYSTEM,
      description: 'Control flow complexity'
    });
  }
}

// Export factory function
export function createComplexityAnalyzer(
  ranges?: Partial<Record<keyof ComplexityMetrics, ComplexityRange>>
): ComplexityAnalyzer {
  return ComplexityAnalyzer.getInstance(ranges);
}

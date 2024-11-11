import { type CodePattern, type PatternExample } from './project-indexer';
import { type PatternMatch } from './pattern-recognizer';

/**
 * Completion Rules Engine
 * 
 * Manages and applies custom completion rules:
 * 1. Rule definition and validation
 * 2. Pattern-based rule matching
 * 3. Context-aware rule application
 */

export interface CompletionRule {
  id: string;
  name: string;
  description: string;
  priority: number;
  enabled: boolean;
  conditions: RuleCondition[];
  actions: RuleAction[];
  patterns?: CodePattern[];
  metadata?: {
    author?: string;
    createdAt: number;
    updatedAt: number;
    usageCount: number;
  };
}

interface RuleCondition {
  type: 'pattern' | 'context' | 'scope' | 'language' | 'custom';
  matcher: string | RegExp | ((context: RuleContext) => boolean);
  options?: {
    caseSensitive?: boolean;
    matchWholeWord?: boolean;
    useRegex?: boolean;
  };
}

interface RuleAction {
  type: 'insert' | 'replace' | 'wrap' | 'suggest' | 'format' | 'custom';
  template: string | ((context: RuleContext) => string);
  options?: {
    position?: 'before' | 'after' | 'replace';
    indentation?: boolean;
    newLine?: boolean;
  };
}

interface RuleContext {
  code: string;
  cursor: {
    line: number;
    column: number;
  };
  file: {
    path: string;
    language: string;
  };
  scope: {
    type: string;
    name: string;
    level: number;
  };
  patterns: PatternMatch[];
  imports: string[];
}

export class CompletionRules {
  private rules: Map<string, CompletionRule>;
  private customMatchers: Map<string, (context: RuleContext) => boolean>;
  private customActions: Map<string, (context: RuleContext) => string>;

  constructor() {
    this.rules = new Map();
    this.customMatchers = new Map();
    this.customActions = new Map();
    this.initializeDefaultRules();
  }

  /**
   * Add a new completion rule
   */
  addRule(rule: CompletionRule): void {
    this.validateRule(rule);
    this.rules.set(rule.id, {
      ...rule,
      metadata: {
        ...rule.metadata,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        usageCount: 0
      }
    });
  }

  /**
   * Apply rules to get completion suggestions
   */
  applySuggestions(context: RuleContext): string[] {
    const suggestions: string[] = [];
    const applicableRules = this.findApplicableRules(context);

    for (const rule of applicableRules) {
      try {
        const suggestion = this.applyRule(rule, context);
        if (suggestion) {
          suggestions.push(suggestion);
          this.updateRuleStats(rule.id);
        }
      } catch (error) {
        console.error(`Error applying rule ${rule.id}:`, error);
      }
    }

    return suggestions;
  }

  /**
   * Register a custom matcher function
   */
  registerMatcher(id: string, matcher: (context: RuleContext) => boolean): void {
    this.customMatchers.set(id, matcher);
  }

  /**
   * Register a custom action function
   */
  registerAction(id: string, action: (context: RuleContext) => string): void {
    this.customActions.set(id, action);
  }

  /**
   * Initialize default completion rules
   */
  private initializeDefaultRules(): void {
    // Import statement rule
    this.addRule({
      id: 'import-statement',
      name: 'Import Statement',
      description: 'Suggests import statements based on used symbols',
      priority: 100,
      enabled: true,
      conditions: [
        {
          type: 'pattern',
          matcher: /^import\s+/
        }
      ],
      actions: [
        {
          type: 'suggest',
          template: (context: RuleContext) => {
            const pattern = context.patterns[0]?.pattern.pattern;
            return pattern || 'import { } from "";';
          }
        }
      ]
    });

    // Function declaration rule
    this.addRule({
      id: 'function-declaration',
      name: 'Function Declaration',
      description: 'Suggests function declarations based on context',
      priority: 90,
      enabled: true,
      conditions: [
        {
          type: 'pattern',
          matcher: /^function\s+/
        }
      ],
      actions: [
        {
          type: 'suggest',
          template: (context: RuleContext) => {
            const pattern = context.patterns[0]?.pattern.pattern;
            return pattern || 'function name() {\n\n}';
          }
        }
      ]
    });

    // Class declaration rule
    this.addRule({
      id: 'class-declaration',
      name: 'Class Declaration',
      description: 'Suggests class declarations based on context',
      priority: 90,
      enabled: true,
      conditions: [
        {
          type: 'pattern',
          matcher: /^class\s+/
        }
      ],
      actions: [
        {
          type: 'suggest',
          template: (context: RuleContext) => {
            const pattern = context.patterns[0]?.pattern.pattern;
            return pattern || 'class Name {\n  constructor() {\n\n  }\n}';
          }
        }
      ]
    });
  }

  /**
   * Find applicable rules for the current context
   */
  private findApplicableRules(context: RuleContext): CompletionRule[] {
    return Array.from(this.rules.values())
      .filter(rule => rule.enabled && this.checkConditions(rule.conditions, context))
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * Check if all conditions match the context
   */
  private checkConditions(conditions: RuleCondition[], context: RuleContext): boolean {
    return conditions.every(condition => {
      switch (condition.type) {
        case 'pattern':
          return this.checkPatternCondition(condition, context);
        case 'context':
          return this.checkContextCondition(condition, context);
        case 'scope':
          return this.checkScopeCondition(condition, context);
        case 'language':
          return this.checkLanguageCondition(condition, context);
        case 'custom':
          return this.checkCustomCondition(condition, context);
        default:
          return false;
      }
    });
  }

  /**
   * Apply a rule to get completion suggestion
   */
  private applyRule(rule: CompletionRule, context: RuleContext): string | null {
    for (const action of rule.actions) {
      try {
        const result = this.applyAction(action, context);
        if (result) return result;
      } catch (error) {
        console.error(`Error applying action in rule ${rule.id}:`, error);
      }
    }
    return null;
  }

  /**
   * Apply an action to get completion text
   */
  private applyAction(action: RuleAction, context: RuleContext): string | null {
    switch (action.type) {
      case 'insert':
      case 'replace':
      case 'wrap':
      case 'suggest':
        return typeof action.template === 'function'
          ? action.template(context)
          : action.template;
      case 'format':
        return this.formatCode(action.template, context);
      case 'custom':
        return this.applyCustomAction(action, context);
      default:
        return null;
    }
  }

  /**
   * Check pattern-based condition
   */
  private checkPatternCondition(condition: RuleCondition, context: RuleContext): boolean {
    const { matcher, options = {} } = condition;
    const { caseSensitive = false, matchWholeWord = false } = options;

    if (typeof matcher === 'function') {
      return matcher(context);
    }

    const pattern = matcher instanceof RegExp ? matcher : new RegExp(
      matchWholeWord ? `\\b${matcher}\\b` : matcher,
      caseSensitive ? '' : 'i'
    );

    return pattern.test(context.code);
  }

  /**
   * Check context-based condition
   */
  private checkContextCondition(condition: RuleCondition, context: RuleContext): boolean {
    // Implement context checking logic
    return true;
  }

  /**
   * Check scope-based condition
   */
  private checkScopeCondition(condition: RuleCondition, context: RuleContext): boolean {
    // Implement scope checking logic
    return true;
  }

  /**
   * Check language-based condition
   */
  private checkLanguageCondition(condition: RuleCondition, context: RuleContext): boolean {
    if (typeof condition.matcher === 'string') {
      return context.file.language === condition.matcher;
    }
    return false;
  }

  /**
   * Check custom condition
   */
  private checkCustomCondition(condition: RuleCondition, context: RuleContext): boolean {
    if (typeof condition.matcher === 'function') {
      return condition.matcher(context);
    }
    if (typeof condition.matcher === 'string') {
      const matcher = this.customMatchers.get(condition.matcher);
      return matcher ? matcher(context) : false;
    }
    return false;
  }

  /**
   * Apply custom action
   */
  private applyCustomAction(action: RuleAction, context: RuleContext): string | null {
    if (typeof action.template === 'function') {
      return action.template(context);
    }
    const customAction = this.customActions.get(action.template);
    return customAction ? customAction(context) : null;
  }

  /**
   * Format code template
   */
  private formatCode(template: string | ((context: RuleContext) => string), context: RuleContext): string {
    const code = typeof template === 'function' ? template(context) : template;
    // TODO: Implement proper code formatting
    return code;
  }

  /**
   * Update rule usage statistics
   */
  private updateRuleStats(ruleId: string): void {
    const rule = this.rules.get(ruleId);
    if (rule && rule.metadata) {
      rule.metadata.usageCount++;
      rule.metadata.updatedAt = Date.now();
    }
  }

  /**
   * Validate rule definition
   */
  private validateRule(rule: CompletionRule): void {
    if (!rule.id || !rule.name || !rule.conditions || !rule.actions) {
      throw new Error(`Invalid rule definition: ${rule.id}`);
    }
    // TODO: Add more validation
  }
}

// Export singleton instance
export const completionRules = new CompletionRules();

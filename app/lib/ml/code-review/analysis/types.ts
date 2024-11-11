export interface CodeMetrics {
  totalLines: number;
  nonEmptyLines: number;
  commentLines: number;
  complexity: number;
  averageLineLength: number;
  maxLineLength: number;
  functionCount: number;
  maintainabilityIndex: number;
}

export type CodeIssueType = 
  | 'complexity'
  | 'style'
  | 'performance'
  | 'security'
  | 'maintainability'
  | 'duplication'
  | 'unused'
  | 'naming';

export type CodeIssueSeverity = 
  | 'error'
  | 'warning'
  | 'info'
  | 'hint';

export interface CodeIssue {
  type: CodeIssueType;
  severity: CodeIssueSeverity;
  message: string;
  line: number;
  column: number;
  file?: string;
  context?: string;
}

export type CodeSuggestionPriority = 
  | 'high'
  | 'medium'
  | 'low';

export interface CodeSuggestion {
  type: string;
  priority: CodeSuggestionPriority;
  message: string;
  details: string;
  file?: string;
  lineStart?: number;
  lineEnd?: number;
  suggestedCode?: string;
}

export interface CodeAnalysisResult {
  metrics: CodeMetrics;
  issues: CodeIssue[];
  suggestions: CodeSuggestion[];
  timestamp: string;
}

export interface AnalysisConfig {
  maxComplexity: number;
  maxLineLength: number;
  maxFunctionLength: number;
  maxFileSize: number;
  enforceNamingConventions: boolean;
  checkDuplicateCode: boolean;
  checkUnusedCode: boolean;
  checkSecurityIssues: boolean;
  languageSpecificRules?: Record<string, any>;
}

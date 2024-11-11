import { dependencyAnalyzer } from './dependency-analyzer';
import { importGraphAnalyzer } from './import-graph';
import { symbolTableTracker } from './symbol-table';

/**
 * Context Analyzer
 * 
 * Coordinates the analysis of code context using:
 * 1. Dependency Analysis
 * 2. Import Graph Analysis
 * 3. Symbol Table Tracking
 * 
 * Provides unified context information for the AI model.
 */

export interface FileContext {
  path: string;
  content: string;
  language: string;
  imports: {
    path: string;
    symbols: string[];
    isType: boolean;
  }[];
  exports: {
    name: string;
    type: string;
    line: number;
  }[];
  dependencies: string[];
  dependents: string[];
}

export interface SymbolContext {
  name: string;
  kind: string;
  type?: string;
  visibility: string;
  location: {
    path: string;
    line: number;
    column: number;
  };
  references: {
    path: string;
    line: number;
    context: string;
  }[];
  documentation?: string;
}

export interface ScopeContext {
  type: string;
  symbols: string[];
  parent?: string;
  children: string[];
}

export interface ProjectContext {
  files: FileContext[];
  dependencies: {
    [key: string]: string[];
  };
  importGraph: {
    nodes: { id: string; symbolCount: number }[];
    edges: { source: string; target: string; symbolCount: number }[];
  };
}

export class ContextAnalyzer {
  private analyzedFiles: Set<string>;
  private fileContexts: Map<string, FileContext>;

  constructor() {
    this.analyzedFiles = new Set();
    this.fileContexts = new Map();
  }

  /**
   * Analyze a file and its context
   */
  async analyzeFile(filePath: string, content: string): Promise<FileContext> {
    if (this.analyzedFiles.has(filePath)) {
      return this.fileContexts.get(filePath)!;
    }

    try {
      // Run all analyzers
      const [depNode, importNode] = await Promise.all([
        dependencyAnalyzer.analyzeFile(filePath, content),
        importGraphAnalyzer.analyzeImports(filePath, content)
      ]);

      // Build file context
      const fileContext: FileContext = {
        path: filePath,
        content,
        language: this.detectLanguage(filePath),
        imports: depNode.imports.map(imp => ({
          path: imp.source,
          symbols: imp.specifiers,
          isType: imp.isType
        })),
        exports: depNode.exports.map(exp => ({
          name: exp.name,
          type: exp.isType ? 'type' : 'value',
          line: exp.line
        })),
        dependencies: Array.from(depNode.dependencies),
        dependents: Array.from(depNode.dependents)
      };

      // Track symbols
      await symbolTableTracker.analyzeFile(filePath, content);

      this.analyzedFiles.add(filePath);
      this.fileContexts.set(filePath, fileContext);

      return fileContext;
    } catch (error) {
      console.error(`Error analyzing context for ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Get context for a specific symbol
   */
  getSymbolContext(name: string, filePath: string): SymbolContext | null {
    const scope = this.findSymbolScope(name, filePath);
    if (!scope) return null;

    const symbol = symbolTableTracker.getSymbol(name, scope);
    if (!symbol) return null;

    return {
      name: symbol.name,
      kind: symbol.kind,
      type: symbol.type,
      visibility: symbol.visibility,
      location: symbol.definition,
      references: symbol.references.map(ref => ({
        path: ref.path,
        line: ref.line,
        context: ref.context
      })),
      documentation: symbol.documentation
    };
  }

  /**
   * Get scope context
   */
  getScopeContext(filePath: string, line: number): ScopeContext | null {
    // TODO: Implement scope finding by location
    return null;
  }

  /**
   * Get project-wide context
   */
  getProjectContext(): ProjectContext {
    return {
      files: Array.from(this.fileContexts.values()),
      dependencies: Array.from(this.fileContexts.entries()).reduce((acc, [path, context]) => {
        acc[path] = context.dependencies;
        return acc;
      }, {} as { [key: string]: string[] }),
      importGraph: importGraphAnalyzer.getGraphData()
    };
  }

  /**
   * Find relevant context for code completion
   */
  async getCompletionContext(filePath: string, line: number, column: number) {
    const fileContext = this.fileContexts.get(filePath);
    if (!fileContext) return null;

    return {
      file: fileContext,
      scope: await this.getScopeContext(filePath, line),
      imports: fileContext.imports,
      // Add more context as needed
    };
  }

  /**
   * Detect file language
   */
  private detectLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'ts':
      case 'tsx':
        return 'typescript';
      case 'js':
      case 'jsx':
        return 'javascript';
      case 'css':
        return 'css';
      case 'html':
        return 'html';
      case 'json':
        return 'json';
      default:
        return 'unknown';
    }
  }

  /**
   * Find scope containing symbol
   */
  private findSymbolScope(name: string, filePath: string): string | null {
    // TODO: Implement proper scope resolution
    return null;
  }

  /**
   * Clear analysis cache
   */
  clearCache(): void {
    this.analyzedFiles.clear();
    this.fileContexts.clear();
    dependencyAnalyzer.clearCache();
    importGraphAnalyzer.clearCache();
    symbolTableTracker.clearTable();
  }
}

// Export singleton instance
export const contextAnalyzer = new ContextAnalyzer();

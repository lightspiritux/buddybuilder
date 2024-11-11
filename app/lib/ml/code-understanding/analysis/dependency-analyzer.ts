/**
 * Dependency Analyzer
 * 
 * Analyzes code dependencies and imports to build a dependency graph
 * and provide context for the AI model.
 */

interface DependencyNode {
  path: string;
  imports: ImportInfo[];
  exports: ExportInfo[];
  dependencies: Set<string>;
  dependents: Set<string>;
}

interface ImportInfo {
  source: string;
  specifiers: string[];
  isType: boolean;
  line: number;
}

interface ExportInfo {
  name: string;
  isType: boolean;
  line: number;
}

export class DependencyAnalyzer {
  private dependencyGraph: Map<string, DependencyNode>;
  private fileContents: Map<string, string>;

  constructor() {
    this.dependencyGraph = new Map();
    this.fileContents = new Map();
  }

  /**
   * Analyze a file and its dependencies
   */
  async analyzeFile(filePath: string, content: string): Promise<DependencyNode> {
    this.fileContents.set(filePath, content);

    let node = this.dependencyGraph.get(filePath);
    if (!node) {
      node = {
        path: filePath,
        imports: [],
        exports: [],
        dependencies: new Set(),
        dependents: new Set()
      };
      this.dependencyGraph.set(filePath, node);
    }

    try {
      // Simple regex-based analysis (will be replaced with proper parsing)
      const lines = content.split('\n');
      node.imports = this.findImports(lines);
      node.exports = this.findExports(lines);

      // Update dependency graph
      node.dependencies = new Set(node.imports.map(imp => this.resolveImportPath(imp.source, filePath)));

      // Update reverse dependencies
      node.dependencies.forEach(dep => {
        let depNode = this.dependencyGraph.get(dep);
        if (!depNode) {
          depNode = {
            path: dep,
            imports: [],
            exports: [],
            dependencies: new Set(),
            dependents: new Set()
          };
          this.dependencyGraph.set(dep, depNode);
        }
        depNode.dependents.add(filePath);
      });

      return node;
    } catch (error) {
      console.error(`Error analyzing file ${filePath}:`, error);
      return node;
    }
  }

  /**
   * Find imports using regex (temporary solution)
   */
  private findImports(lines: string[]): ImportInfo[] {
    const imports: ImportInfo[] = [];
    const importRegex = /^import\s+(?:type\s+)?(?:{([^}]+)}|\*\s+as\s+\w+|\w+)?(?:\s*,\s*(?:{([^}]+)}|\*\s+as\s+\w+))?\s+from\s+['"]([^'"]+)['"]/;
    
    lines.forEach((line, index) => {
      const match = line.match(importRegex);
      if (match) {
        const specifiers: string[] = [];
        if (match[1]) {
          specifiers.push(...match[1].split(',').map(s => s.trim()));
        }
        if (match[2]) {
          specifiers.push(...match[2].split(',').map(s => s.trim()));
        }
        
        imports.push({
          source: match[3],
          specifiers,
          isType: line.includes('import type'),
          line: index + 1
        });
      }
    });

    return imports;
  }

  /**
   * Find exports using regex (temporary solution)
   */
  private findExports(lines: string[]): ExportInfo[] {
    const exports: ExportInfo[] = [];
    const exportRegex = /^export\s+(?:type\s+)?(?:{([^}]+)}|(?:class|interface|function|const|let|var)\s+(\w+))/;
    
    lines.forEach((line, index) => {
      const match = line.match(exportRegex);
      if (match) {
        if (match[1]) {
          // Named exports
          match[1].split(',').forEach(exp => {
            exports.push({
              name: exp.trim(),
              isType: line.includes('export type'),
              line: index + 1
            });
          });
        } else if (match[2]) {
          // Direct exports
          exports.push({
            name: match[2],
            isType: line.includes('export type'),
            line: index + 1
          });
        }
      }
    });

    return exports;
  }

  /**
   * Get all dependencies for a file
   */
  getDependencies(filePath: string): Set<string> {
    const node = this.dependencyGraph.get(filePath);
    return node?.dependencies || new Set();
  }

  /**
   * Get all files that depend on this file
   */
  getDependents(filePath: string): Set<string> {
    const node = this.dependencyGraph.get(filePath);
    return node?.dependents || new Set();
  }

  /**
   * Get import/export information for context analysis
   */
  getFileContext(filePath: string) {
    const node = this.dependencyGraph.get(filePath);
    if (!node) return null;

    return {
      imports: node.imports,
      exports: node.exports,
      dependencies: Array.from(node.dependencies),
      dependents: Array.from(node.dependents)
    };
  }

  /**
   * Resolve import path relative to the importing file
   */
  private resolveImportPath(importPath: string, currentFilePath: string): string {
    // Simple path resolution (will be enhanced)
    if (importPath.startsWith('.')) {
      const currentDir = currentFilePath.split('/').slice(0, -1).join('/');
      return `${currentDir}/${importPath}`;
    }
    return importPath;
  }

  /**
   * Clear analysis cache
   */
  clearCache(): void {
    this.dependencyGraph.clear();
    this.fileContents.clear();
  }
}

// Export singleton instance
export const dependencyAnalyzer = new DependencyAnalyzer();

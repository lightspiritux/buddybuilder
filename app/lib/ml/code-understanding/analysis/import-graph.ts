import { dependencyAnalyzer } from './dependency-analyzer';

/**
 * Import Graph Analyzer
 * 
 * Builds and analyzes the import graph of the project to:
 * 1. Track symbol dependencies
 * 2. Analyze usage patterns
 * 3. Build import relationship maps
 */

interface ImportNode {
  path: string;
  symbols: Map<string, SymbolInfo>;
  incomingReferences: Map<string, ReferenceInfo[]>;
  outgoingReferences: Map<string, ReferenceInfo[]>;
}

interface SymbolInfo {
  name: string;
  type: 'class' | 'function' | 'variable' | 'type' | 'interface' | 'unknown';
  exported: boolean;
  references: ReferenceInfo[];
  definition?: {
    line: number;
    column: number;
  };
}

interface ReferenceInfo {
  symbol: string;
  sourcePath: string;
  targetPath: string;
  line: number;
  isType: boolean;
}

export class ImportGraphAnalyzer {
  private importGraph: Map<string, ImportNode>;
  private analyzed: Set<string>;

  constructor() {
    this.importGraph = new Map();
    this.analyzed = new Set();
  }

  /**
   * Analyze imports and build the graph
   */
  async analyzeImports(filePath: string, content: string): Promise<ImportNode> {
    if (this.analyzed.has(filePath)) {
      return this.importGraph.get(filePath)!;
    }

    // Analyze dependencies first
    const depNode = await dependencyAnalyzer.analyzeFile(filePath, content);

    // Create or get import node
    let node = this.importGraph.get(filePath);
    if (!node) {
      node = {
        path: filePath,
        symbols: new Map(),
        incomingReferences: new Map(),
        outgoingReferences: new Map()
      };
      this.importGraph.set(filePath, node);
    }

    // Process imports
    for (const imp of depNode.imports) {
      const targetPath = imp.source;
      
      // Add references for each imported symbol
      imp.specifiers.forEach(symbol => {
        const reference: ReferenceInfo = {
          symbol,
          sourcePath: filePath,
          targetPath,
          line: imp.line,
          isType: imp.isType
        };

        // Add outgoing reference
        if (!node!.outgoingReferences.has(targetPath)) {
          node!.outgoingReferences.set(targetPath, []);
        }
        node!.outgoingReferences.get(targetPath)!.push(reference);

        // Add incoming reference to target
        let targetNode = this.importGraph.get(targetPath);
        if (!targetNode) {
          targetNode = {
            path: targetPath,
            symbols: new Map(),
            incomingReferences: new Map(),
            outgoingReferences: new Map()
          };
          this.importGraph.set(targetPath, targetNode);
        }

        if (!targetNode.incomingReferences.has(filePath)) {
          targetNode.incomingReferences.set(filePath, []);
        }
        targetNode.incomingReferences.get(filePath)!.push(reference);
      });
    }

    // Process exports
    for (const exp of depNode.exports) {
      node.symbols.set(exp.name, {
        name: exp.name,
        type: this.inferSymbolType(exp.name, content),
        exported: true,
        references: [],
        definition: {
          line: exp.line,
          column: 0 // TODO: Add column information
        }
      });
    }

    this.analyzed.add(filePath);
    return node;
  }

  /**
   * Get all references to a symbol
   */
  getSymbolReferences(symbol: string, filePath: string): ReferenceInfo[] {
    const node = this.importGraph.get(filePath);
    if (!node) return [];

    const symbolInfo = node.symbols.get(symbol);
    if (!symbolInfo) return [];

    return symbolInfo.references;
  }

  /**
   * Get all files that import from this file
   */
  getImportingFiles(filePath: string): string[] {
    const node = this.importGraph.get(filePath);
    if (!node) return [];

    return Array.from(node.incomingReferences.keys());
  }

  /**
   * Get all files imported by this file
   */
  getImportedFiles(filePath: string): string[] {
    const node = this.importGraph.get(filePath);
    if (!node) return [];

    return Array.from(node.outgoingReferences.keys());
  }

  /**
   * Get import graph for visualization
   */
  getGraphData() {
    const nodes = Array.from(this.importGraph.keys()).map(path => ({
      id: path,
      symbolCount: this.importGraph.get(path)!.symbols.size
    }));

    const edges = Array.from(this.importGraph.values()).flatMap(node => 
      Array.from(node.outgoingReferences.entries()).map(([target, refs]) => ({
        source: node.path,
        target,
        symbolCount: refs.length
      }))
    );

    return { nodes, edges };
  }

  /**
   * Infer symbol type from context
   */
  private inferSymbolType(name: string, content: string): SymbolInfo['type'] {
    // Simple type inference based on naming conventions and keywords
    if (content.includes(`class ${name}`)) return 'class';
    if (content.includes(`function ${name}`)) return 'function';
    if (content.includes(`interface ${name}`)) return 'interface';
    if (content.includes(`type ${name}`)) return 'type';
    if (name[0] === name[0].toUpperCase()) return 'class';
    return 'variable';
  }

  /**
   * Clear analysis cache
   */
  clearCache(): void {
    this.importGraph.clear();
    this.analyzed.clear();
  }
}

// Export singleton instance
export const importGraphAnalyzer = new ImportGraphAnalyzer();

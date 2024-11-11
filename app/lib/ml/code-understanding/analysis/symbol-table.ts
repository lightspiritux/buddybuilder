import { importGraphAnalyzer } from './import-graph';

/**
 * Symbol Table Tracker
 * 
 * Tracks symbol definitions and usage across the codebase:
 * 1. Maintains symbol definitions and scopes
 * 2. Tracks symbol visibility and access
 * 3. Provides symbol lookup and reference tracking
 */

interface Scope {
  id: string;
  type: 'global' | 'module' | 'class' | 'function' | 'block';
  parent?: string;
  children: string[];
  symbols: Map<string, Symbol>;
  range: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
}

interface Symbol {
  name: string;
  kind: 'variable' | 'function' | 'class' | 'interface' | 'type' | 'parameter' | 'property';
  type?: string;
  value?: string;
  documentation?: string;
  visibility: 'public' | 'private' | 'protected' | 'internal';
  scope: string;
  definition: {
    path: string;
    line: number;
    column: number;
  };
  references: SymbolReference[];
  modifiers: Set<
    | 'readonly'
    | 'static'
    | 'async'
    | 'export'
    | 'abstract'
    | 'declare'
    | 'const'
    | 'let'
    | 'var'
  >;
}

interface SymbolReference {
  path: string;
  line: number;
  column: number;
  isWrite: boolean;
  context: string;
}

export class SymbolTableTracker {
  private scopes: Map<string, Scope>;
  private globalScope: string;
  private currentScope: string;
  private scopeCounter: number;

  constructor() {
    this.scopes = new Map();
    this.scopeCounter = 0;
    this.globalScope = this.createScope('global');
    this.currentScope = this.globalScope;
  }

  /**
   * Analyze file and build symbol table
   */
  async analyzeFile(filePath: string, content: string) {
    // Create module scope
    const moduleScope = this.createScope('module', this.globalScope);
    
    try {
      // Get import information
      const importNode = await importGraphAnalyzer.analyzeImports(filePath, content);
      
      // Process imported symbols
      for (const [targetPath, refs] of importNode.outgoingReferences) {
        refs.forEach(ref => {
          this.addImportedSymbol(ref.symbol, {
            path: targetPath,
            line: ref.line,
            column: 0
          }, moduleScope);
        });
      }

      // Process exported symbols
      for (const [name, symbolInfo] of importNode.symbols) {
        this.addSymbol({
          name,
          kind: this.convertTypeToKind(symbolInfo.type),
          visibility: 'public',
          scope: moduleScope,
          definition: {
            path: filePath,
            line: symbolInfo.definition?.line || 0,
            column: symbolInfo.definition?.column || 0
          },
          references: [],
          modifiers: new Set(['export'])
        });
      }

      // Analyze code structure
      this.analyzeCodeStructure(content, moduleScope, filePath);

    } catch (error) {
      console.error(`Error analyzing symbols in ${filePath}:`, error);
    }
  }

  /**
   * Get symbol information
   */
  getSymbol(name: string, scope: string): Symbol | undefined {
    // Check current scope
    const currentScope = this.scopes.get(scope);
    if (!currentScope) return undefined;

    // Look in current scope
    const symbol = currentScope.symbols.get(name);
    if (symbol) return symbol;

    // Look in parent scope
    if (currentScope.parent) {
      return this.getSymbol(name, currentScope.parent);
    }

    return undefined;
  }

  /**
   * Get all symbols in a scope
   */
  getScopeSymbols(scopeId: string): Symbol[] {
    const scope = this.scopes.get(scopeId);
    if (!scope) return [];

    return Array.from(scope.symbols.values());
  }

  /**
   * Find all references to a symbol
   */
  findReferences(name: string, scopeId: string): SymbolReference[] {
    const symbol = this.getSymbol(name, scopeId);
    if (!symbol) return [];

    return symbol.references;
  }

  /**
   * Create a new scope
   */
  private createScope(type: Scope['type'], parent?: string): string {
    const id = `scope_${++this.scopeCounter}`;
    
    this.scopes.set(id, {
      id,
      type,
      parent,
      children: [],
      symbols: new Map(),
      range: {
        start: { line: 0, column: 0 },
        end: { line: 0, column: 0 }
      }
    });

    if (parent) {
      const parentScope = this.scopes.get(parent);
      if (parentScope) {
        parentScope.children.push(id);
      }
    }

    return id;
  }

  /**
   * Add a symbol to the table
   */
  private addSymbol(symbol: Symbol) {
    const scope = this.scopes.get(symbol.scope);
    if (!scope) return;

    scope.symbols.set(symbol.name, symbol);
  }

  /**
   * Add an imported symbol
   */
  private addImportedSymbol(
    name: string,
    definition: Symbol['definition'],
    scopeId: string
  ) {
    this.addSymbol({
      name,
      kind: 'variable', // Will be updated when the actual symbol is processed
      visibility: 'public',
      scope: scopeId,
      definition,
      references: [],
      modifiers: new Set(['const'])
    });
  }

  /**
   * Convert import graph type to symbol kind
   */
  private convertTypeToKind(type: string): Symbol['kind'] {
    switch (type) {
      case 'class':
        return 'class';
      case 'function':
        return 'function';
      case 'interface':
        return 'interface';
      case 'type':
        return 'type';
      default:
        return 'variable';
    }
  }

  /**
   * Analyze code structure to build scopes and symbols
   */
  private analyzeCodeStructure(content: string, moduleScope: string, filePath: string) {
    const lines = content.split('\n');
    let currentLine = 0;

    // Simple structure analysis (will be enhanced)
    while (currentLine < lines.length) {
      const line = lines[currentLine].trim();

      // Class definition
      if (line.startsWith('class ')) {
        const match = line.match(/class\s+(\w+)/);
        if (match) {
          const className = match[1];
          const classScope = this.createScope('class', moduleScope);
          
          this.addSymbol({
            name: className,
            kind: 'class',
            visibility: 'public',
            scope: moduleScope,
            definition: {
              path: filePath,
              line: currentLine + 1,
              column: lines[currentLine].indexOf('class')
            },
            references: [],
            modifiers: new Set()
          });
        }
      }

      // Function definition
      if (line.startsWith('function ')) {
        const match = line.match(/function\s+(\w+)/);
        if (match) {
          const functionName = match[1];
          const functionScope = this.createScope('function', moduleScope);
          
          this.addSymbol({
            name: functionName,
            kind: 'function',
            visibility: 'public',
            scope: moduleScope,
            definition: {
              path: filePath,
              line: currentLine + 1,
              column: lines[currentLine].indexOf('function')
            },
            references: [],
            modifiers: new Set()
          });
        }
      }

      currentLine++;
    }
  }

  /**
   * Clear symbol table
   */
  clearTable(): void {
    this.scopes.clear();
    this.scopeCounter = 0;
    this.globalScope = this.createScope('global');
    this.currentScope = this.globalScope;
  }
}

// Export singleton instance
export const symbolTableTracker = new SymbolTableTracker();
